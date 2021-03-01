

export type LocateBy = {
    ref?: string,
    id?: string,
    className?: string,
    xpath?: string,
}

export type TestProgramLine = {
    cmd: 'getPage' | 'clickElement' | 'snapshot' | 'element',
    $ref?: string,
    url?: string,
    by?: LocateBy,
    descendands?: TestProgramLine[],
}

export type DeviceRequest = {
    os: "string",
    os_version: "string",
    browser: "string",
    browser_version: "string" | null,
    device: "string" | null,
}

export type TestRequest = {
    devices: DeviceRequest[],
    test: TestProgramLine[],
}

export type DeviceCapabilities = {
    os: "string",
    os_version: "string",
    browserName: "string",
    browser_version: "string" | null,
    device: "string" | null,
}

export type DeviceTestDefinition = {
    capabilities: DeviceCapabilities,
    test: {
        deviceId: string,
        testId: string,
        creationDate: number,
        testCode: TestProgramLine[],
    }
}
export  type TestDefinition = {
    testId: string,
    devices: DeviceTestDefinition[]
}

export type DeviceTestResult = {
    capabilities: DeviceCapabilities,
    test: {
        deviceId: string,
        testId: string,
        creationDate: number,
        testCode?: any,
    },
    captures: string[],
}

export type TestResult = {
    testId: string,
    devices: DeviceTestResult[]
}

