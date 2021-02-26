#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { DevicemegatestStack } from '../lib/devicemegatest-stack';

const app = new cdk.App();
new DevicemegatestStack(app, 'DevicemegatestStack');
