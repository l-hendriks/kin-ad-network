import AWS from 'aws-sdk-mock';
import { DynamoDB } from 'aws-sdk';
import { AttributeMap } from 'aws-sdk/clients/dynamodb';
import nock from 'nock';

import ironsource from '../../handlers/ironsource';

process.env.REGION = 'test-region';
process.env.EVENTS_TABLE_NAME = 'test-event-table';
process.env.CLIENT_TABLE_NAME = 'test-client-table';
process.env.IRONSOURCE_PRIVATE_KEY = 'supersecret';

const mockQuery = (
    clientMockResult: AttributeMap[] | undefined,
    eventMockResult: AttributeMap[] | undefined,
): void => {
    AWS.mock('DynamoDB', 'query', (params, cb) => {
        if (params.TableName === 'test-client-table') {
            cb(null, { Items: clientMockResult });
        } else if (params.TableName === 'test-event-table') {
            cb(null, { Items: eventMockResult });
        }
    });
};

describe('ironsource callback', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        AWS.restore();
    });

    it('should save the event and send success callback', async () => {
        mockQuery([DynamoDB.Converter.marshall({ callbackUrl: 'http://someurl.com', clientId: 'testClient' })], undefined);
        AWS.mock('DynamoDB', 'updateItem', (params: unknown, cb: () => unknown) => {
            expect(params).toEqual({
                ExpressionAttributeNames: {
                    '#rewards': 'rewards',
                    '#timestamp': 'timestamp',
                    '#userId': 'userId',
                },
                ExpressionAttributeValues: {
                    ':rewards': { S: '10' },
                    ':timestamp': { S: '123123' },
                    ':userId': { S: 'userId' },
                },
                Key: {
                    clientId: { S: 'clientId' },
                    eventId: { S: 'eventId' },
                },
                TableName: 'test-event-table',
                UpdateExpression: 'SET #rewards = :rewards, #timestamp = :timestamp, #userId = :userId',
            });
            cb();
        });

        nock('http://someurl.com')
            .get('/?eventId=eventId&rewards=10&timestamp=123123&userId=userId&success=true')
            .reply(200);

        const result = await ironsource({
            queryStringParameters: {
                country: '',
                // eslint-disable-next-line @typescript-eslint/camelcase
                custom_clientId: 'clientId',
                eventId: 'eventId',
                publisherSubId: '',
                rewards: '10',
                signature: '9a9232cf5155cb0226cc1cb777cd926f',
                timestamp: '123123',
                userId: 'userId',
            },
        });

        expect(result).toEqual({ statusCode: 200, body: 'eventId:OK' });
        expect.assertions(2);
    });

    it('should not save the event and send success callback when event already saved', async () => {
        mockQuery([DynamoDB.Converter.marshall({ callbackUrl: 'http://someurl.com', clientId: 'testClient' })], [{ x: { N: '1' } }]);

        nock('http://someurl.com')
            .get('/?eventId=eventId&rewards=10&timestamp=123123&userId=userId&success=false')
            .reply(200);

        const result = await ironsource({
            queryStringParameters: {
                country: '',
                // eslint-disable-next-line @typescript-eslint/camelcase
                custom_clientId: 'clientId',
                eventId: 'eventId',
                publisherSubId: '',
                rewards: '10',
                signature: '9a9232cf5155cb0226cc1cb777cd926f',
                timestamp: '123123',
                userId: 'userId',
            },
        });

        expect(result).toEqual({ statusCode: 200, body: 'eventId:OK' });
    });

    it('should not save the event and send success callback when client could not be found', async () => {
        mockQuery([], undefined);

        nock('http://someurl.com')
            .get('/?eventId=eventId&rewards=10&timestamp=123123&userId=userId&success=false')
            .reply(200);

        const result = await ironsource({
            queryStringParameters: {
                country: '',
                // eslint-disable-next-line @typescript-eslint/camelcase
                custom_clientId: 'clientId',
                eventId: 'eventId',
                publisherSubId: '',
                rewards: '10',
                signature: '9a9232cf5155cb0226cc1cb777cd926f',
                timestamp: '123123',
                userId: 'userId',
            },
        });

        expect(result).toEqual({ statusCode: 200, body: 'eventId:OK' });
    });

    it('should not save the event and send success callback when items are empty', async () => {
        mockQuery(undefined, undefined);

        nock('http://someurl.com')
            .get('/?eventId=eventId&rewards=10&timestamp=123123&userId=userId&success=false')
            .reply(200);

        const result = await ironsource({
            queryStringParameters: {
                country: '',
                // eslint-disable-next-line @typescript-eslint/camelcase
                custom_clientId: 'clientId',
                eventId: 'eventId',
                publisherSubId: '',
                rewards: '10',
                signature: '9a9232cf5155cb0226cc1cb777cd926f',
                timestamp: '123123',
                userId: 'userId',
            },
        });

        expect(result).toEqual({ statusCode: 200, body: 'eventId:OK' });
    });

    it('should not save the event and send success callback when signature is incorrect', async () => {
        mockQuery([DynamoDB.Converter.marshall({ callbackUrl: 'http://someurl.com', clientId: 'testClient' })], undefined);

        nock('http://someurl.com')
            .get('/?eventId=eventId&rewards=10&timestamp=123123&userId=userId&success=false')
            .reply(200);

        const result = await ironsource({
            queryStringParameters: {
                country: '',
                // eslint-disable-next-line @typescript-eslint/camelcase
                custom_clientId: 'clientId',
                eventId: 'eventId',
                publisherSubId: '',
                rewards: '10',
                signature: 'wrong',
                timestamp: '123123',
                userId: 'userId',
            },
        });

        expect(result).toEqual({ statusCode: 200, body: 'eventId:OK' });
    });
});
