/* eslint-disable no-console */
import AWS from 'aws-sdk-mock';
import nock from 'nock';

import reporting from '../../handlers/reporting';

jest.mock('moment-es6', () => ({
    __esModule: true,
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    default: () => jest.requireActual('moment')('2020-01-01T00:00:00.000Z'),
}));

const mockSheet = {
    loadHeaderRow: jest.fn(),
    addRow: jest.fn(),
    title: 'ironSource',
};
const mockLoadInfo = jest.fn();
const mockUseServiceAccountAuth = jest.fn();

jest.mock('google-spreadsheet', () => ({
    __esModule: true,
    GoogleSpreadsheet: jest.fn(() => ({
        loadInfo: mockLoadInfo,
        useServiceAccountAuth: mockUseServiceAccountAuth,
        sheetsByIndex: [mockSheet],
    })),
}));

process.env.REGION = 'test-region';
process.env.INFO_TABLE_NAME = 'test-info-table';
process.env.GOOGLE_CREDENTIALS_JSON = JSON.stringify({});
process.env.IRONSOURCE_SECRET_KEY = 'secret';
process.env.IRONSOURCE_REFRESH_TOKEN = 'token';

describe('reporting cron job', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        AWS.restore();
    });

    it('should save the reports in a Google Sheet', async () => {
        AWS.mock('DynamoDB', 'updateItem', (params: unknown, cb: () => unknown) => {
            expect(params).toEqual({
                ExpressionAttributeNames: {
                    '#eCPM': 'eCPM',
                    '#revenue': 'revenue',
                },
                ExpressionAttributeValues: {
                    ':eCPM': { N: '2.09' },
                    ':revenue': { N: '0.07' },
                },
                Key: {
                    clientId: { S: 'appKey' },
                    date: { S: '2019-12-31' },
                },
                TableName: 'test-info-table',
                UpdateExpression: 'SET #eCPM = :eCPM, #revenue = :revenue',
            });
            cb();
        });

        nock('https://platform.ironsrc.com', {
            reqheaders: {
                secretkey: 'secret',
                refreshToken: 'token',
            },
        })
            .get('/partners/publisher/auth')
            .reply(200, JSON.stringify('bearer'));

        nock('https://platform.ironsrc.com', {
            reqheaders: {
                Authorization: 'Bearer bearer',
            },
        })
            .get('/partners/publisher/mediation/applications/v6/stats?startDate=2019-12-31&endDate=2019-12-31&breakdown=app&ironSource&adSource=ironSource')
            .reply(200, [{
                appKey: 'appKey',
                date: '2020-04-03',
                adUnits: 'Rewarded Video',
                bundleId: 'bundle.id',
                appName: 'App name',
                data: [
                    { eCPM: 2, revenue: 0.02, impressions: 100 },
                    // do not count 0 eCPM with >0 impressions (admob)
                    { eCPM: 0, revenue: 0.02, impressions: 50 },
                    { eCPM: 3, revenue: 0.03, impressions: 10 },
                ],
            }]);

        await reporting();

        expect(mockLoadInfo).toBeCalled();
        expect(mockUseServiceAccountAuth).toBeCalled();
        expect(mockSheet.loadHeaderRow).toBeCalled();
        expect(mockSheet.addRow).toBeCalledWith({ Date: '2019-12-31', appKey: 0.07 });

        expect.assertions(5);
    });
});
