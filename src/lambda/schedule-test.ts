import {  APIGatewayProxyHandlerV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { SQS, S3, Lambda } from 'aws-sdk';
import {  TestRequest, TestDefinition } from '../types';

const generateTestId = () => String(Math.round(Math.random() * 10000000));

const sqs = new SQS();
const s3 = new S3();
const lambda = new Lambda();

function respondeWith<T>(statusCode: string, body: T) {
    return <APIGatewayProxyResultV2<any>>{
        statusCode,
        body: JSON.stringify(body),
    }
}

export const handle: APIGatewayProxyHandlerV2<any> = async (event, context) => {
    const {OUTPUT_BUCKET, TESTREQUEST_QUEUE} = process.env;

    if (!TESTREQUEST_QUEUE) {
        console.error('Request Q name missing');
        return respondeWith("400", "Request_Q name is empty");
    }
    if (!OUTPUT_BUCKET) {
        console.error('Ouput Bucket name missing');
        return respondeWith("400", "Bucket name is empty");
    }
    const { body } = event;
    if (!body) {
        return respondeWith("400", "Body is empty");
    }
    let testRequest: TestRequest;
    try {
        testRequest = JSON.parse(body);
    } catch(e) {
        console.error('Invalid incoming payload', e);
        return respondeWith("400", "Invalid request payload: " + body);
    }

    const testId = generateTestId();

    const testDefinion: TestDefinition = {
        testId,
        devices: testRequest.devices.map( ({browser, browser_version, device, os, os_version}, idx) => ({
            capabilities: {
                os,
                os_version,
                browserName: browser,
                browser_version,
                device,
            },
            test: {
                testId,
                deviceId: `Device_${idx}`,
                creationDate: Date.now(),
                testCode: testRequest.test,
            }
        }))
    }

    await s3.upload({
        Bucket: OUTPUT_BUCKET,
        Key: `${testId}/definition.json`,
        Body: JSON.stringify(testDefinion),
        ContentType: 'application/json',
    }).promise();

    const deviceTestDefUploads = testDefinion.devices.map(d => s3.upload({
            Bucket: OUTPUT_BUCKET,
            Key: `${d.test.testId}/${d.test.deviceId}/definition.json`,
            Body: JSON.stringify(d),
            ContentType: 'application/json',
    }).promise());
    await Promise.all(deviceTestDefUploads);


    const testJobRequests = testDefinion.devices.map(d => {
        return sqs.sendMessage({
            MessageBody: JSON.stringify(d),
            QueueUrl: TESTREQUEST_QUEUE,
        }).promise();
    });

    const res =  await Promise.all(testJobRequests);
    console.log({ res });

    const { $response } = await lambda.invokeAsync({
        FunctionName: process.env.EXECUTOR_FN || '',
        InvokeArgs: JSON.stringify({}),
    }).promise();

    console.log({ $response });

    return {
        ok: 1,
        testDefinion,
    }
}