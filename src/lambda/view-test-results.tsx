import {  APIGatewayProxyHandlerV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { S3 } from 'aws-sdk';
import { render }  from 'preact-render-to-string';
import { h } from 'preact';

import { 
    TestRequest,
    TestDefinition, 
    DeviceTestResult,
    TestResult} from '../types';
const s3 = new S3({});

type Capture = {
    key: string
}

export async function collectViewModel(testId?: string) {
    if (!testId) {
        console.error('Test id missing');
        null;
    }
    const { OUTPUT_BUCKET } = process.env;
    if (!OUTPUT_BUCKET) {
        console.error('Output bucket name is empty');
        return null;
    }

    const { Body } = await s3.getObject({ Bucket: OUTPUT_BUCKET, Key: `${testId}/definition.json` }).promise() ;
    if (!Body) {
        console.error('Empty body returned');
        return null;
    }
    const testDefinition: TestResult = JSON.parse(Body as any);
    for(let device of testDefinition.devices) {
        const capturesFile = `${testId}/${device.test.deviceId}/captures.json`
        try {
            const { Body } = await s3.getObject({ Bucket: OUTPUT_BUCKET, Key: capturesFile }).promise() ;
            const captures: Capture[] = JSON.parse(Body as any);
            delete device.test.testCode;
            device.captures = captures.map(c => c.key);
        }
        catch (e) {
            console.warn(`Its not yet: ${capturesFile}`)
        }        
    }
    return testDefinition;
}

type DeviceResultViewProps = {
    deviceResult: DeviceTestResult
}
function DeviceResultView({ deviceResult }: DeviceResultViewProps) {
    return (
        <div className="device-row">
            <div className="device-intro">
                <div>{deviceResult.capabilities.device}</div>
                <div>{deviceResult.capabilities.os}</div>
                <div>{deviceResult.capabilities.os_version}</div>
                <div>{deviceResult.capabilities.browserName}</div>
                <div>{deviceResult.capabilities.browser_version}</div>

            </div>
            {deviceResult.captures?.map( 
                (c, i) => <img src={`https://d1btyqzh53285m.cloudfront.net/${c}`} key={i} />)}
        </div>
    )
}

type TestResultViewProps = {
    testResult: TestResult | null,
    event?: any,
}
function TestResultView({ testResult, event }: TestResultViewProps) {
    return (
        <html>
            <head>
                <style>
                    {`
                        .content-area {
                            width: 100%;
                            height: 100%;
                            overflow: auto;
                            position: relative;
                        }
                        .device-row {
                            height: 250px;
                            white-space: nowrap;
                            margin-bottom: 20px;
                        }
                        .device-intro {
                            display: inline-block;
                            height: 250px;
                            width: 200px;
                        }

                        .device-row img {
                            width: 250px;
                            height: 250px;
                            border: 1px solid silver;
                            diplay: inline-block;
                            object-fit: contain;
                            margin-right: 20px;
                        }

                        .zoomimg {
                            position: fixed;
                            top: 100px;
                            left: 100px;
                            width: calc(100vw - 200px);
                            height: calc(100vh - 200px);
                            object-fit: contain;
                        }
                    `}
                </style>
            </head>
            <body>
                <div className="contant-area" id="content-area">
                    {testResult && testResult.devices.map( (d, i) => <DeviceResultView deviceResult={d} key={i} />)}
                </div>
                <script>
                    {`
                        const caElm = document.getElementById('content-area');
                        caElm.addEventListener('click', function(e) {
                            console.log({ e });
                            if (e.target instanceof HTMLImageElement) {
                                const img = document.createElement('img');
                                img.src = e.target.src;
                                img.className = 'zoomimg';
                                document.body.appendChild(img);
                            }
                        });
                    `}
                </script>
            </body>
        </html>
    )
}

export const handle: APIGatewayProxyHandlerV2<string> = async (event, context) => {
    let vm: TestResult | null;
    try {
        vm = await collectViewModel(event.queryStringParameters?.testId)
    } catch(e) {
        return {
            statusCode: 400,
            body: e.message,
        }
    }

    return {
        statusCode: 200,
        body: render(<TestResultView testResult={vm} />),
        headers: {
            'content-type': 'text/html',
        }
    }
}