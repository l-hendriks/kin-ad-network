/* eslint-disable no-console */
import AWS from 'aws-sdk-mock';
import { DynamoDB } from 'aws-sdk';
import { AttributeMap } from 'aws-sdk/clients/dynamodb';
import nock from 'nock';

import ironsource from '../../handlers/ironsource';

process.env.REGION = 'test-region';
process.env.APPS_TABLE_NAME = 'test-apps-table';
process.env.APP_EVENTS_TABLE_NAME = 'test-app-event-table';
process.env.EVENTS_TABLE_NAME = 'test-event-table';
process.env.CLIENT_TABLE_NAME = 'test-client-table';
process.env.IRONSOURCE_PRIVATE_KEY = 'supersecret';

const mockQuery = (
    clientMockResult: AttributeMap[] | undefined,
    eventMockResult: AttributeMap[] | undefined,
): void => {
    AWS.mock('DynamoDB', 'query', (params, cb) => {
        if (params.TableName === 'test-apps-table') {
            return cb(null, { Items: clientMockResult });
        }

        if (params.TableName === 'test-app-event-table') {
            return cb(null, { Items: eventMockResult });
        }

        throw (Error('unmocked'));
    });
};

const consoleLog = console.log;
console.log = jest.fn();

const dateNow = Date.now;
Date.now = (): number => 1586582640000;

describe('ironsource callback', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        AWS.restore();
    });

    afterAll(() => {
        console.log = consoleLog;
        Date.now = dateNow;
    });

    it('should save the event and send success callback', async () => {
        mockQuery([DynamoDB.Converter.marshall({
            callbackUrl: 'http://someurl.com',
            dataIdx: 'callback#IRONSOURCE#clientId',
            signatureSecret: 'secret',
            userId: 'userId',
        })], undefined);
        AWS.mock('DynamoDB', 'updateItem', (params: unknown, cb: () => unknown) => {
            expect(params).toEqual({
                ExpressionAttributeNames: {
                    '#expires': 'expires',
                    '#rewards': 'rewards',
                    '#timestamp': 'timestamp',
                    '#appUserId': 'appUserId',
                },
                ExpressionAttributeValues: {
                    ':rewards': { S: '10' },
                    ':timestamp': { S: '202004110724' },
                    ':appUserId': { S: 'appUserId' },
                    ':expires': { N: '1586669040' },
                },
                Key: {
                    userId: { S: 'userId' },
                    eventId: { S: 'eventId' },
                },
                TableName: 'test-app-event-table',
                UpdateExpression: 'SET #rewards = :rewards, #timestamp = :timestamp, #appUserId = :appUserId, #expires = :expires',
            });
            cb();
        });

        nock('http://someurl.com')
            .get('/?eventId=eventId&rewards=10&timestamp=202004110724&userId=appUserId&signature=1aced430ed68570232bb546e84d0aecaebe9eec6b789ac99f3989e3d1f166454&custom_wallet=abc123')
            .reply(200);

        const result = await ironsource({
            queryStringParameters: {
                country: '',
                appKey: 'clientId',
                eventId: 'eventId',
                publisherSubId: '',
                rewards: '10',
                signature: '840a10bda8df0666d5f0da54750d23a5',
                timestamp: '202004110724',
                userId: 'appUserId',
                custom_wallet: 'abc123', // eslint-disable-line @typescript-eslint/camelcase
            },
            headers: { 'X-Forwarded-For': '79.125.5.179' },
        });

        expect(result).toEqual({ statusCode: 200, body: 'eventId:OK' });
        expect.assertions(2);
    });

    it('should work when the callback contains a querystring', async () => {
        mockQuery([DynamoDB.Converter.marshall({
            callbackUrl: 'http://someurl.com?a=b',
            dataIdx: 'callback#IRONSOURCE#clientId',
            signatureSecret: 'secret',
            userId: 'userId',
        })], undefined);
        AWS.mock('DynamoDB', 'updateItem', (params: unknown, cb: () => unknown) => {
            cb();
        });

        nock('http://someurl.com')
            .get('/?a=b&eventId=eventId&rewards=10&timestamp=202004110724&userId=appUserId&signature=1aced430ed68570232bb546e84d0aecaebe9eec6b789ac99f3989e3d1f166454&custom_wallet=abc123')
            .reply(200);

        const result = await ironsource({
            queryStringParameters: {
                country: '',
                appKey: 'clientId',
                eventId: 'eventId',
                publisherSubId: '',
                rewards: '10',
                signature: '840a10bda8df0666d5f0da54750d23a5',
                timestamp: '202004110724',
                userId: 'appUserId',
                custom_wallet: 'abc123', // eslint-disable-line @typescript-eslint/camelcase
            },
            headers: { 'X-Forwarded-For': '79.125.5.179' },
        });

        expect(result).toEqual({ statusCode: 200, body: 'eventId:OK' });
        expect.assertions(1);
    });

    it('should save the event and not send success callback when the app has no callback', async () => {
        mockQuery([DynamoDB.Converter.marshall({
            dataIdx: 'callback#IRONSOURCE#clientId',
            signatureSecret: 'secret',
            userId: 'userId',
        })], undefined);
        AWS.mock('DynamoDB', 'updateItem', (params: unknown, cb: () => unknown) => {
            cb();
        });

        const result = await ironsource({
            queryStringParameters: {
                country: '',
                appKey: 'clientId',
                eventId: 'eventId',
                publisherSubId: '',
                rewards: '10',
                signature: '840a10bda8df0666d5f0da54750d23a5',
                timestamp: '202004110724',
                userId: 'appUserId',
                custom_wallet: 'abc123', // eslint-disable-line @typescript-eslint/camelcase
            },
            headers: { 'X-Forwarded-For': '79.125.5.179' },
        });

        expect(result).toEqual({ statusCode: 200, body: 'eventId:OK' });
        expect.assertions(1);
    });

    it('should not save the event and send success callback when event older than a day', async () => {
        const result = await ironsource({
            queryStringParameters: {
                country: '',
                appKey: 'clientId',
                eventId: 'eventId',
                publisherSubId: '',
                rewards: '10',
                signature: '6d19a5d0cf1d78b97571d85f64b6675e',
                timestamp: '202004100624',
                userId: 'userId',
            },
            headers: { 'X-Forwarded-For': '79.125.5.179' },
        });

        expect(result).toEqual({ statusCode: 200, body: 'eventId:OK' });
        expect(console.log).toBeCalledWith('ERROR: expired event: 202004100624');
    });

    it('should not save the event and send success callback when event already saved', async () => {
        mockQuery([DynamoDB.Converter.marshall({
            dataIdx: 'callback#IRONSOURCE#clientId',
            signatureSecret: 'secret',
            userId: 'userId',
        })], [{ x: { N: '1' } }]);

        const result = await ironsource({
            queryStringParameters: {
                country: '',
                appKey: 'clientId',
                eventId: 'eventId',
                publisherSubId: '',
                rewards: '10',
                signature: '6d19a5d0cf1d78b97571d85f64b6675e',
                timestamp: '202004110724',
                userId: 'userId',
            },
            headers: { 'X-Forwarded-For': '79.125.5.179' },
        });

        expect(result).toEqual({ statusCode: 200, body: 'eventId:OK' });
        expect(console.log).toBeCalledWith('ERROR: Event already sent for event eventId with user userId');
    });

    it('should not save the event and send success callback when client could not be found', async () => {
        mockQuery([], undefined);

        const result = await ironsource({
            queryStringParameters: {
                country: '',
                appKey: 'clientId',
                eventId: 'eventId',
                publisherSubId: '',
                rewards: '10',
                signature: '6d19a5d0cf1d78b97571d85f64b6675e',
                timestamp: '202004110724',
                userId: 'userId',
            },
            headers: { 'X-Forwarded-For': '79.125.5.179' },
        });

        expect(result).toEqual({ statusCode: 200, body: 'eventId:OK' });
        expect(console.log).toBeCalledWith('ERROR: Error: Could not find client with ID: clientId');
    });

    it('should not save the event and send success callback when items are empty', async () => {
        mockQuery(undefined, undefined);

        const result = await ironsource({
            queryStringParameters: {
                country: '',
                appKey: 'clientId',
                eventId: 'eventId',
                publisherSubId: '',
                rewards: '10',
                signature: '6d19a5d0cf1d78b97571d85f64b6675e',
                timestamp: '202004110724',
                userId: 'userId',
            },
            headers: { 'X-Forwarded-For': '79.125.5.179' },
        });

        expect(result).toEqual({ statusCode: 200, body: 'eventId:OK' });
        expect(console.log).toBeCalledWith('ERROR: Error: Could not find client with ID: clientId');
    });

    it('should not save the event and send success callback when signature is incorrect', async () => {
        mockQuery([DynamoDB.Converter.marshall({
            dataIdx: 'callback#IRONSOURCE#clientId',
            signatureSecret: 'secret',
            userId: 'userId',
        })], undefined);

        const result = await ironsource({
            queryStringParameters: {
                country: '',
                appKey: 'clientId',
                eventId: 'eventId',
                publisherSubId: '',
                rewards: '10',
                signature: 'wrong',
                timestamp: '202004110724',
                userId: 'userId',
            },
            headers: { 'X-Forwarded-For': '79.125.5.179' },
        });

        expect(result).toEqual({ statusCode: 200, body: 'eventId:OK' });
        expect(console.log).toBeCalledWith('ERROR: Signature did not match for event eventId with user userId');
    });

    it('should not save the event and send success callback when source ip incorrect', async () => {
        mockQuery([DynamoDB.Converter.marshall({ callbackUrl: 'http://someurl.com', clientId: 'testClient', signatureSecret: 'secret' })], undefined);

        const result = await ironsource({
            queryStringParameters: {
                country: '',
                appKey: 'clientId',
                eventId: 'eventId',
                publisherSubId: '',
                rewards: '10',
                signature: 'wrong',
                timestamp: '202004110724',
                userId: 'userId',
            },
            headers: { 'X-Forwarded-For': '1.2.3.4' },
        });

        expect(result).toEqual({ statusCode: 200, body: 'eventId:OK' });
        expect(console.log).toBeCalledWith('ERROR: incorrect source ip: 1.2.3.4');
    });
});
