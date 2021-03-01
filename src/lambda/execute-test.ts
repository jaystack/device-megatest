import { Handler } from 'aws-lambda';
import { Builder, By, Locator, ThenableWebDriver, until } from 'selenium-webdriver';
import { Lambda, S3 } from 'aws-sdk';
import { SQS } from 'aws-sdk';
import { DeviceTestDefinition } from '../types';


const s3 = new S3();
const sqs = new SQS({ });
const lambda = new Lambda({ });
function sleep(duration: number) {
  return new Promise((r) => setTimeout(r, duration));
}


type StepContext = {
  testId: string,
  deviceId: string,
  captures: any[],
  elementRefs: Map<string, any>,
}

type GetPageNode = {
  url: string,
}

export async function getPage(driver: ThenableWebDriver, node: GetPageNode, context:any) {
  const { url } = node;
  await driver.get(url);
}

type SnapshotNode = {
  name: string,
}

async function capture(
  driver: ThenableWebDriver,
  testId: string, 
  deviceId: string,
  imageName: string,
) {
  console.log('Save image');
  const { OUTPUT_BUCKET } = process.env;

  if (!OUTPUT_BUCKET) {
    console.warn('OUTPUT_BUCKET name is empty. skipping');
    return;
  }

  try {
    const image = await driver.takeScreenshot();
    var base64Data = image.replace(/^data:image\/png;base64,/,"")
    const key = `${testId}/${deviceId}/${imageName}.png`;
    const upload = await s3.upload({ 
      Bucket: OUTPUT_BUCKET, 
      Key: key,
      Body: Buffer.from(base64Data, 'base64'),
      ContentType: 'image/png',
    }).promise();
    return {
      upload,
      key,
    }
  } catch (e) {
    console.error('Save image failed.', e);
    return null;
  }
}

export async function snapshot(driver: ThenableWebDriver, node: SnapshotNode, context: StepContext) : Promise<void> {
  const { testId, deviceId, captures } = context;
  const { name } = node;
  const result = await capture(driver, testId, deviceId, name);
  captures.push(result);
}

type BySelector = {
  className?: string,
  id?: string,
  xpath?: string,
  ref?: string,
  under?: string,
  css?: string,
}
type ElementNode = {
  by: BySelector,
  $ref?: string,
  descendands?: ElementNode[],
  waitFor?: number,
}

export async function element(driver: ThenableWebDriver, node: ElementNode, context: StepContext) {
  const { elementRefs } = context;
  const { waitFor, by, $ref, descendands } = node;
  let elm;
  let locator: Locator | null = null;

  if (by.xpath) {
    locator = By.xpath(by.xpath)
  } else if (by.className) {
    locator = By.className(by.className)
  } else if (by.id) {
    locator = By.id(by.id)
  } else if (by.css) {
    locator = By.css(by.css)
  } else if (by.ref) {
    elm = elementRefs.get(by.ref)
    if (!elm) {
      console.warn(`by ref: no such variable ${by.ref}`)
    }
  } 

  try {
    if (locator) {
      if (waitFor) {
        elm = await driver.wait(until.elementLocated(locator), waitFor)
      } else {
        const root: any = by.under ? elementRefs.get(by.under)  : driver;
        elm = await root.findElement(locator)
      }
    }
  } catch(e) {
    console.error('Error locating element', node);
    console.error(e);
  }

  if (elm && $ref) {
    elementRefs.set($ref, elm);
  }
  if (!elm) {
    console.warn('element not found', node);
  }
  return elm;
}

type ClickElementNode = {
  by: BySelector,
  waitFor?: number,
}

export async function clickElement(driver: ThenableWebDriver, node: ClickElementNode, context: StepContext) {
  const { by, waitFor } = node;
  const elm = await element(driver, { by, waitFor} , context);
  if (elm) {
    await elm.click();
  } else {
    console.warn('no element to click', node)
  }
}

export async function wait(driver: ThenableWebDriver, node: any) {
  const { ms, seconds } = node
  const duration = ms ?? seconds * 1000;
  return new Promise(r => setTimeout(r, duration));
}
const dispatch: any = {
  'getPage':  getPage,
  'snapshot': snapshot,
  'element': element,
  'clickElement': clickElement,
  'wait': wait,
}

export async function makeTestRequest(driver: ThenableWebDriver, test: DeviceTestDefinition) {
  const captures: any[] = [];
  const { test: { testId, deviceId, testCode } } = test;
  const stepContext: StepContext = {
    testId: testId,
    deviceId: deviceId,
    captures,
    elementRefs: new Map<string, any>(),
  }
  for(const testStep of testCode) {
    const stepCode: any = dispatch[testStep.cmd];
    if (stepCode) {
      await stepCode(driver, testStep, stepContext);
    } else {
      console.warn(`Unkown command ${testStep.cmd} skipping`);
    }
  }
  console.log({ captures, elementRefs: stepContext.elementRefs.keys() });

  await s3.upload({
    Bucket: process.env.OUTPUT_BUCKET || '',
    Key: `${testId}/${deviceId}/captures.json`,
    Body: JSON.stringify(captures),
    ContentType: 'application/json',
  }).promise();
  console.log('uploaded');

}

export async function makeTestRequestCoded(driver: ThenableWebDriver, test: string,
    capture: (filename: string) => Promise<void>, testId: string, deviceId: string,) {
      console.log('creating driver')
    await driver.get('https://www.haven.com')
    console.log('open');
    await capture("open");
    const cookieConsentButton = await driver.wait(until.elementLocated(By.id('onetrust-accept-btn-handler')), 3000);
    await capture("content_dialog");
    console.log('waiting for button click');
    await cookieConsentButton.click();
    await capture("post_consent");
    

    const searchEntry = await driver.findElement(By.className('bl-haven-searchEntryWidget'));
    const parkInputGroup = await searchEntry.findElement(By.xpath('.//div/div/div/div[1]'));
    const dateInputGroup = await searchEntry.findElement(By.xpath('./div/div/div/div[2]'));
    const guestInputGroup = await searchEntry.findElement(By.xpath('./div/div/div/div[3]'));
    const searchInputGroup = await searchEntry.findElement(By.xpath('./div/div/div/div[4]'));

    const parkInput = await parkInputGroup.findElement(By.xpath('.//div/button[1]'));
    await parkInput.click();
    await capture('select_park');

    const firstParkButton = await parkInputGroup.findElement(By.xpath('.//span/button[1]'));
    await firstParkButton.click();

    await capture('park_picked');

    const dayInput = await dateInputGroup.findElement(By.xpath(`.//*[@class='flatpickr-day '][1]`));
    await dayInput.click();
    await capture('day_selected');

    const doneButton = await dateInputGroup.findElement(By.className('bl-haven-dropdown__doneButton'));
    await doneButton.click();
    await capture('day_picked');

    const searchButton = await searchInputGroup.findElement(By.xpath('.//button[1]'));
    await searchButton.click();
    await capture('search_pressed');

    const guestsDone = await guestInputGroup.findElement(By.className('bl-haven-dropdown__doneButton'));
    await guestsDone.click();
    await capture('guests_picked');

    await searchButton.click();
    await capture('search_pressed_2');

    await sleep(500)
    await capture('delay_500');

}




export const handle:Handler = async (event, context) => {
    console.log({ event, context });
    const { functionName }  = context;
    const { TESTREQUEST_QUEUE, BROWSERSTACK_URL} = process.env;

    if (!BROWSERSTACK_URL) {
      console.error('BROWSERSTACK_URL is empty');
      return;
    }
    const { Messages } = await sqs.receiveMessage({
      QueueUrl: TESTREQUEST_QUEUE as string,
      MaxNumberOfMessages: 1,
      VisibilityTimeout: 120,
    }).promise();

    if (!Messages || !Messages.length) {
      console.log('no more message. exit loop');
      return;
    }
    const msg = Messages[0];
    const { Body: message, ReceiptHandle:  receiptHandle} = msg;
    if (!message) {
      console.error('Message body is strangly null, exiting');
      return;
    }
    const testRequest: DeviceTestDefinition = JSON.parse(message);
    console.log({ testRequest });

    const { test: {testId, deviceId}, capabilities  } = testRequest;
    var driver = new Builder().
      usingServer(BROWSERSTACK_URL).
      withCapabilities(capabilities).
      build();
    
    const collectedCaptures: any[] = [];

    async function _capture(captureName:string ) {
      console.log(`Capture: ${captureName}`);
      const upload = await capture(driver, testId, deviceId, captureName);
      collectedCaptures.push(upload);
    }

    await makeTestRequest(driver, testRequest);
    console.log('Test requested completed');
    await driver.quit();
    console.log('Driver quit');

    await sqs.deleteMessage({ 
      QueueUrl: TESTREQUEST_QUEUE as string,
      ReceiptHandle: receiptHandle as string,
    }).promise();
    const { $response, Status } = await lambda.invokeAsync({
      FunctionName: functionName, 
      InvokeArgs: JSON.stringify({}),
    }).promise();
    console.log({ $response, Status });

}