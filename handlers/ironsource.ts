import { createHash, createHmac } from 'crypto';
import { DynamoDB } from 'aws-sdk';
import fetch from 'node-fetch';
import { LambdaResponse, IronSourceCallback, Client } from '../constants';

// From https://developers.ironsrc.com/ironsource-mobile-general/handling-server-to-server-callback-events/
const VALID_IP = [
    '79.125.5.179',
    '79.125.26.193',
    '79.125.117.130',
    '176.34.224.39',
    '176.34.224.41',
    '176.34.224.49',
    '34.194.180.125',
    '34.196.56.165',
    '34.196.251.81',
    '34.196.253.23',
    '54.88.253.218',
    '54.209.185.78',
];

const getClient = async (clientId: string): Promise<Client> => {
    const ddb = new DynamoDB({ region: process.env.REGION });
    const { Items } = await ddb.query({
        ExpressionAttributeNames: { '#clientId': 'clientId' },
        ExpressionAttributeValues: { ':clientId': { S: clientId } },
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        TableName: process.env.CLIENT_TABLE_NAME!,
        KeyConditionExpression: '#clientId = :clientId',
    }).promise();

    if (!Items || Items.length === 0) {
        throw Error(`Could not find client with ID: ${clientId}`);
    }

    return DynamoDB.Converter.unmarshall(Items[0]) as Client;
};

const isEventAlreadySent = async (clientId: string, eventId: string): Promise<boolean> => {
    const ddb = new DynamoDB({ region: process.env.REGION });
    const { Items } = await ddb.query({
        ExpressionAttributeNames: { '#clientId': 'clientId', '#eventId': 'eventId' },
        ExpressionAttributeValues: { ':clientId': { S: clientId }, ':eventId': { S: eventId } },
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        TableName: process.env.EVENTS_TABLE_NAME!,
        KeyConditionExpression: '#clientId = :clientId AND #eventId = :eventId',
    }).promise();

    if (!Items || Items.length === 0) {
        return false;
    }

    return true;
};

const saveEvent = (
    clientId: string,
    eventId: string,
    rewards: string,
    timestamp: string,
    userId: string,
): Promise<unknown> => {
    const ddb = new DynamoDB({ region: process.env.REGION });
    return ddb.updateItem({
        Key: {
            clientId: { S: clientId },
            eventId: { S: eventId },
        },
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        TableName: process.env.EVENTS_TABLE_NAME!,
        UpdateExpression: 'SET #rewards = :rewards, #timestamp = :timestamp, #userId = :userId',
        ExpressionAttributeNames: { '#rewards': 'rewards', '#timestamp': 'timestamp', '#userId': 'userId' },
        ExpressionAttributeValues: DynamoDB.Converter.marshall({
            ':rewards': rewards,
            ':timestamp': timestamp,
            ':userId': userId,
        }),
    }).promise();
};

const checkSignature = (
    timestamp: string,
    eventId: string,
    userId: string,
    rewards: string,
    signature: string,
): boolean => {
    const calculatedSignature = createHash('md5')
        .update(`${timestamp}${eventId}${userId}${rewards}${process.env.IRONSOURCE_PRIVATE_KEY}`)
        .digest('hex');

    if (calculatedSignature !== signature) {
        return false;
    }

    return true;
};

const returnMessage = (eventId: string): LambdaResponse => ({
    statusCode: 200,
    body: `${eventId}:OK`,
});

const ironsourceCallback = async (
    event: IronSourceCallback,
): Promise<LambdaResponse> => {
    const {
        appKey: clientId,
        eventId,
        rewards,
        signature,
        timestamp,
        userId,
    } = event.queryStringParameters;

    // CHeck source ip
    const firstForwardedFor = event.headers['X-Forwarded-For'].split(',')[0].trim();
    if (!VALID_IP.includes(firstForwardedFor)) {
        // Log error in cloudwatch
        // eslint-disable-next-line no-console
        console.log(`ERROR: incorrect source ip: ${firstForwardedFor}`);
        return returnMessage(eventId);
    }

    // Get callback url using clientId
    let client: Client;
    try {
        client = await getClient(clientId);
    } catch (e) {
        // Log error in cloudwatch
        // eslint-disable-next-line no-console
        console.log(`ERROR: ${e}`);
        return returnMessage(eventId);
    }

    if (!checkSignature(timestamp, eventId, userId, rewards, signature)) {
        // Log error in cloudwatch
        // eslint-disable-next-line no-console
        console.log(`ERROR: Signature did not match for event ${eventId} with client ${clientId}`);
        return returnMessage(eventId);
    }

    // Check if event was already sent before
    if (await isEventAlreadySent(clientId, eventId)) {
        // Log error in cloudwatch
        // eslint-disable-next-line no-console
        console.log(`ERROR: Event already sent for event ${eventId} with client ${clientId}`);
        return returnMessage(eventId);
    }

    // Add to events database for realtime tracking
    await saveEvent(clientId, eventId, rewards, timestamp, userId);

    // Calculate signature for sending to app
    const returnSignature = createHmac('sha256', client.signatureSecret)
        .update(`${clientId}${eventId}${userId}${timestamp}`)
        .digest('hex');

    // Send callback to client if set
    if (client.callbackUrl) {
        const qsObject = {
            eventId,
            rewards,
            timestamp,
            userId,
            signature: returnSignature,
            // Attach custom parameters to the querystring as well
            ...Object.entries(event.queryStringParameters).reduce((acc, [key, value]) => {
                if (key.includes('custom_')) {
                    acc[key] = value;
                }
                return acc;
            }, {}),
        };

        const returnQuerystring = Object.keys(qsObject).map((key) => (`${key}=${qsObject[key]}`)).join('&');
        await fetch(`${client.callbackUrl}?${returnQuerystring}`);
    }
    return returnMessage(eventId);
};

export default ironsourceCallback;
