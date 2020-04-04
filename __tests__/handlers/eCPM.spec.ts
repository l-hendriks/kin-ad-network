/* eslint-disable no-console */
import AWS from 'aws-sdk-mock';
import { DynamoDB } from 'aws-sdk';
import { AttributeMap } from 'aws-sdk/clients/dynamodb';

import eCPM from '../../handlers/eCPM';

process.env.REGION = 'test-region';
process.env.ECPM_TABLE_NAME = 'test-ecpm-table';
process.env.CLIENT_TABLE_NAME = 'test-client-table';

const mockQuery = (
    clientMockResult: AttributeMap[] | undefined,
    ecpmMockResult: AttributeMap[] | undefined,
): void => {
    AWS.mock('DynamoDB', 'query', (params, cb) => {
        expect(params).toMatchSnapshot();
        if (params.TableName === 'test-client-table') {
            cb(null, { Items: clientMockResult });
        } else if (params.TableName === 'test-ecpm-table') {
            cb(null, { Items: ecpmMockResult });
        }
    });
};

describe('eCPM aAPI', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        AWS.restore();
    });

    it('should return the eCPM', async () => {
        mockQuery(
            [DynamoDB.Converter.marshall({ callbackUrl: 'http://someurl.com', clientId: 'testClient', secret: 'someSecret' })],
            [DynamoDB.Converter.marshall({ eCPM: 2.13 })],
        );

        const result = await eCPM({
            queryStringParameters: {
                date: '2000-01-01',
                appKey: 'appKey',
                secret: 'someSecret',
            },
        });

        expect(result).toEqual({
            statusCode: 200,
            body: JSON.stringify({ eCPM: 2.13 }),
        });
        expect.assertions(3);
    });

    it('should return an error when the client could not be found', async () => {
        mockQuery(
            undefined,
            [DynamoDB.Converter.marshall({ eCPM: 2.13 })],
        );

        const result = await eCPM({
            queryStringParameters: {
                date: '2000-01-01',
                appKey: 'appKey',
                secret: 'someSecret',
            },
        });

        expect(result).toEqual({
            statusCode: 400,
            body: JSON.stringify({ error: 'Incorrect client' }),
        });
        expect.assertions(2);
    });

    it('should return an error when the secret is incorrect', async () => {
        mockQuery(
            [DynamoDB.Converter.marshall({ callbackUrl: 'http://someurl.com', clientId: 'testClient', secret: 'someSecret' })],
            [DynamoDB.Converter.marshall({ eCPM: 2.13 })],
        );

        const result = await eCPM({
            queryStringParameters: {
                date: '2000-01-01',
                appKey: 'appKey',
                secret: 'incorrectSecret',
            },
        });

        expect(result).toEqual({
            statusCode: 400,
            body: JSON.stringify({ error: 'Incorrect secret' }),
        });
        expect.assertions(2);
    });

    it('should return an error when the record could not be found', async () => {
        mockQuery(
            [DynamoDB.Converter.marshall({ callbackUrl: 'http://someurl.com', clientId: 'testClient', secret: 'someSecret' })],
            undefined,
        );

        const result = await eCPM({
            queryStringParameters: {
                date: '2000-01-01',
                appKey: 'appKey',
                secret: 'someSecret',
            },
        });

        expect(result).toEqual({
            statusCode: 400,
            body: JSON.stringify({ error: 'Could not find record' }),
        });
        expect.assertions(3);
    });

    it('should return an error when the records are empty', async () => {
        mockQuery(
            [DynamoDB.Converter.marshall({ callbackUrl: 'http://someurl.com', clientId: 'testClient', secret: 'someSecret' })],
            [],
        );

        const result = await eCPM({
            queryStringParameters: {
                date: '2000-01-01',
                appKey: 'appKey',
                secret: 'someSecret',
            },
        });

        expect(result).toEqual({
            statusCode: 400,
            body: JSON.stringify({ error: 'Could not find record' }),
        });
        expect.assertions(3);
    });
});
