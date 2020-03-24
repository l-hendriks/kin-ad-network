export interface IronSourceCallback {
    queryStringParameters: {
        appKey: string;
        country: string;
        eventId: string;
        publisherSubId: string;
        rewards: string;
        signature: string;
        timestamp: string;
        userId: string;
    };
    requestContext: {
        identity: {
            sourceIp: string;
        };
    };
}

export interface LambdaResponse {
    statusCode: number;
    body: string;
}

export interface Client {
    clientId: string;
    callbackUrl: string;
}
