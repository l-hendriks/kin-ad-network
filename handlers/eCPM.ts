import { DynamoDB } from 'aws-sdk';
import {
    LambdaResponse,
    ECPM,
    ECPMEvent,
    Client,
} from '../constants';

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

const getECPM = async (clientId: string, date: string): Promise<ECPM> => {
    const ddb = new DynamoDB({ region: process.env.REGION });
    const { Items } = await ddb.query({
        ExpressionAttributeNames: { '#clientId': 'clientId', '#date': 'date' },
        ExpressionAttributeValues: { ':clientId': { S: clientId }, ':date': { S: date } },
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        TableName: process.env.ECPM_TABLE_NAME!,
        KeyConditionExpression: '#clientId = :clientId AND #date = :date',
    }).promise();

    if (!Items || Items.length === 0) {
        return undefined;
    }

    return DynamoDB.Converter.unmarshall(Items[0]) as ECPM;
};

const ironsourceCallback = async (
    event: ECPMEvent,
): Promise<LambdaResponse> => {
    const {
        secret,
        date,
        appKey,
    } = event.queryStringParameters;

    // Get callback url using clientId
    let client: Client;
    try {
        client = await getClient(appKey);
    } catch (e) {
        // Log error in cloudwatch
        // eslint-disable-next-line no-console
        console.log(`ERROR: ${e}`);
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Incorrect client' }),
        };
    }

    if (client.secret !== secret) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Incorrect secret' }),
        };
    }

    const record = await getECPM(appKey, date);

    if (!record) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Could not find record' }),
        };
    }

    return {
        statusCode: 200,
        body: JSON.stringify({ eCPM: record.eCPM }),
    };
};

export default ironsourceCallback;
