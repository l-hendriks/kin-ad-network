export interface IronSourceCallback {
    queryStringParameters: {
        [_: string]: string;
    };
    headers: {
        'X-Forwarded-For': string;
    };
}

export interface InfoEvent {
    queryStringParameters: {
        appKey: string;
        date: string;
        secret: string;
    };
}

export interface LambdaResponse {
    statusCode: number;
    body: string;
}

export interface Client {
    clientId: string;
    callbackUrl: string;
    secret: string;
    signatureSecret: string;
}

export interface Info {
    clientId: string;
    date: string;
    eCPM: number;
}

// google-spreadsheet typings not yet available, so custom interfaces for now
export interface GoogleCreds {
    type: string;
    project_id: string;
    private_key_id: string;
    private_key: string;
    client_email: string;
    client_id: string;
    auth_uri: string;
    token_uri: string;
    auth_provider_x509_cert_url: string;
    client_x509_cert_url: string;
}

export interface Sheet {
    addRow: (rows: Record<string, string>) => Promise<void>;
    loadHeaderRow: () => Promise<void>;
    title: string;
}

export interface Doc {
    useServiceAccountAuth: (googleCreds: GoogleCreds) => Promise<void>;
    loadInfo: () => Promise<void>;
    sheetsByIndex: Sheet[];
}

interface IronSourceReportAppData {
    revenue: number;
    eCPM: number;
    appFillRate: number;
    appRequests: number;
    appFills: number;
    impressions: number;
    videoCompletions: number;
    revenuePerCompletion: number;
    useRate: number;
    activeUsers: number;
    engagedUsers: number;
    engagementRate: number;
    impressionsPerEngagedUser: number;
    revenuePerActiveUser: number;
    revenuePerEngagedUser: number;
    sessions: number;
    engagedSessions: number;
    impressionPerEngagedSessions: number;
    impressionsPerSession: number;
    sessionsPerActiveUser: number;
    adSourceChecks: number;
    adSourceResponses: number;
    adSourceAvailabilityRate: number;
    clicks: number;
    clickThroughRate: number;
}

export interface IronSourceReport {
    appKey: string;
    date: string;
    adUnits: string;
    bundleId: string;
    appName: string;
    data: IronSourceReportAppData[];
}

export interface InformationObject {
    eCPM: number[];
    impressions: number[];
    revenue: number[];
}
