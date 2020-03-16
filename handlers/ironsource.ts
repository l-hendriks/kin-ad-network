import { createHash } from 'crypto';
import { DynamoDB } from 'aws-sdk';
import fetch from 'node-fetch';
import { LambdaResponse, IronSourceCallback, Client } from '../constants';

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
    const ddb = new DynamoDB({ region: process.env.AWS_REGION });
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
    { queryStringParameters }: IronSourceCallback,
): Promise<LambdaResponse> => {
    const {
        custom_clientId: clientId,
        eventId,
        rewards,
        signature,
        timestamp,
        userId,
    } = queryStringParameters;

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
        await fetch(`${client.callbackUrl}?eventId=${eventId}&rewards=${rewards}&timestamp=${timestamp}&userId=${userId}&success=false`);
        return returnMessage(eventId);
    }

    // Check if event was already sent before
    if (await isEventAlreadySent(clientId, eventId)) {
        await fetch(`${client.callbackUrl}?eventId=${eventId}&rewards=${rewards}&timestamp=${timestamp}&userId=${userId}&success=false`);
        return returnMessage(eventId);
    }

    // Add to events database for realtime tracking
    await saveEvent(clientId, eventId, rewards, timestamp, userId);

    // Send callback to client
    await fetch(`${client.callbackUrl}?eventId=${eventId}&rewards=${rewards}&timestamp=${timestamp}&userId=${userId}&success=true`);
    return returnMessage(eventId);
};

export default ironsourceCallback;
