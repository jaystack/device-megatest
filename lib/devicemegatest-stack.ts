import { HttpApi, PayloadFormatVersion } from '@aws-cdk/aws-apigatewayv2';
import { LambdaProxyIntegration } from '@aws-cdk/aws-apigatewayv2-integrations';
import { SqsEventSource, SnsEventSource } from '@aws-cdk/aws-lambda-event-sources';
import { NodejsFunction } from '@aws-cdk/aws-lambda-nodejs';
import { Bucket } from '@aws-cdk/aws-s3';
import { Queue  } from '@aws-cdk/aws-sqs';
import { Topic } from '@aws-cdk/aws-sns';
import { LambdaSubscription } from '@aws-cdk/aws-sns-subscriptions';
import { CachePolicy, CacheQueryStringBehavior, Distribution, LambdaEdgeEventType, OriginRequestPolicy, OriginRequestQueryStringBehavior } from '@aws-cdk/aws-cloudfront';
import { HttpOrigin, S3Origin } from '@aws-cdk/aws-cloudfront-origins';

import * as cdk from '@aws-cdk/core';
import { CfnOutput } from '@aws-cdk/core';
import { PolicyStatement } from '@aws-cdk/aws-iam';
import {  config } from 'dotenv';

config();

export class DevicemegatestStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const outputBucket = new Bucket(this, 'OutputBucket', { });


    const MAX_TEST_TIME = cdk.Duration.minutes(3);

    const jobRequestDLQ = new Queue(this, 'JobRequestDeadLettersQueue', { });
    const executorDLQ = new Queue(this, 'JobExecutorDLQ', { });
    const jobRequestQ = new Queue(this, 'JobRequestQueue', {
      visibilityTimeout: MAX_TEST_TIME,
      deadLetterQueue: {        
        queue: jobRequestDLQ,
        maxReceiveCount: 20,
      }
    });

    const testExecutorFunction = new NodejsFunction(this, 'ExecuteTest', {
      entry: './src/lambda/execute-test.ts',
      handler: 'handle',
      timeout: MAX_TEST_TIME,
      reservedConcurrentExecutions: 1, //the number of active runners in BrowserStack
      retryAttempts: 2,
      deadLetterQueue: executorDLQ,
      memorySize: 2048,
      bundling: {
        forceDockerBundling: true,
        nodeModules: ['selenium-webdriver']
      },
      environment: {
        OUTPUT_BUCKET: outputBucket.bucketName,
        TESTREQUEST_QUEUE: jobRequestQ.queueUrl,
        BROWSERSTACK_URL: process.env.BROWSERSTACK_URL || '',
      }
    });

    jobRequestQ.grantConsumeMessages(testExecutorFunction);

    const ps = new PolicyStatement({});
    ps.addActions('lambda:InvokeFunction');
    ps.addResources('*');
    testExecutorFunction.addToRolePolicy(ps);

    const testSchedulerFunction = new NodejsFunction(this, 'Scheduler', {
      entry: './src/lambda/schedule-test.ts',
      handler: 'handle',
      timeout: cdk.Duration.seconds(30),
      environment: {
        TESTREQUEST_QUEUE: jobRequestQ.queueUrl,
        OUTPUT_BUCKET: outputBucket.bucketName,
        EXECUTOR_FN: testExecutorFunction.functionName,
      }      
    })

    testExecutorFunction.grantInvoke(testSchedulerFunction);
    jobRequestQ.grantSendMessages(testSchedulerFunction);
    outputBucket.grantReadWrite(testExecutorFunction);
    outputBucket.grantReadWrite(testSchedulerFunction);
    
    const schedulerAPI = new HttpApi(this, 'SchedulerAPI', {
      defaultIntegration: new LambdaProxyIntegration({
        handler: testSchedulerFunction,
        payloadFormatVersion: PayloadFormatVersion.VERSION_2_0,
      })
    });
    
    const schedulerAPIDomain =  `${schedulerAPI.httpApiId}.execute-api.${this.region}.amazonaws.com`;
    new CfnOutput(this, 'SchedulerAPIAddress', { value: schedulerAPIDomain })

    const resultViewerFunction = new NodejsFunction(this, 'ResultViewer', {
      entry: './src/lambda/view-test-results.tsx',
      handler: 'handle',
      environment: {
        OUTPUT_BUCKET: outputBucket.bucketName,
      }
    });

    outputBucket.grantReadWrite(resultViewerFunction);

    const viewerAPI = new HttpApi(this, 'ViewerAPI', {
      defaultIntegration: new LambdaProxyIntegration({
        handler: resultViewerFunction,
        payloadFormatVersion: PayloadFormatVersion.VERSION_2_0,
      })
    });

    const viewerAPIDomain = `${viewerAPI.httpApiId}.execute-api.${this.region}.amazonaws.com`;
    new CfnOutput(this, 'ViewerAPIAddress', { value: viewerAPIDomain })

    const front = new Distribution(this, 'MegaTestFront', {
      defaultBehavior: {
        origin: new S3Origin(outputBucket)
      },
      additionalBehaviors: {
        '/launch': {
          origin: new HttpOrigin(schedulerAPIDomain),
          originRequestPolicy: new OriginRequestPolicy(this, 'LaunchRP', {
            queryStringBehavior: OriginRequestQueryStringBehavior.all(),
          }),
          cachePolicy: new CachePolicy(this, 'LaunchCP', {
            minTtl: cdk.Duration.seconds(0),
            maxTtl: cdk.Duration.seconds(0),
            defaultTtl: cdk.Duration.seconds(0),
          })
        },
        '/view': {
          origin: new HttpOrigin(viewerAPIDomain),
          originRequestPolicy: new OriginRequestPolicy(this, 'ViewRP', {
            queryStringBehavior: OriginRequestQueryStringBehavior.all(),
          }),
          cachePolicy: new CachePolicy(this, 'ViewCP', {
            minTtl: cdk.Duration.seconds(0),
            maxTtl: cdk.Duration.seconds(0),
            defaultTtl: cdk.Duration.seconds(0),
          })
        }

      }
    })
  }
}
