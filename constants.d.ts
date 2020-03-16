export interface IronSourceCallback {
    queryStringParameters: {
      country: string;
      custom_clientId: string; // eslint-disable-line camelcase
      eventId: string;
      publisherSubId: string;
      rewards: string;
      signature: string;
      timestamp: string;
      userId: string;
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
