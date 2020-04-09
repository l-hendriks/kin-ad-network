/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { DynamoDB } from 'aws-sdk';
import fetch from 'node-fetch';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import moment from 'moment-es6';
import { Doc, Sheet, IronSourceReport } from '../constants';

const IRONSOURCE_AUTH_URL = 'https://platform.ironsrc.com/partners/publisher/auth';
const IRONSOURCE_REPORTING_URL = 'https://platform.ironsrc.com/partners/publisher/mediation/applications/v6/stats';
const AD_NETWORKS = ['ironSource'];

const loadAllSheets = async (doc: Doc): Promise<Record<string, Sheet>> => {
    // Load sheets by title
    const sheets = {};
    let i = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
        const sheet = doc.sheetsByIndex[i];
        if (!sheet) {
            break;
        }

        // eslint-disable-next-line no-await-in-loop
        await sheet.loadHeaderRow();
        sheets[sheet.title] = sheet;
        i += 1;
    }

    return sheets;
};

const parseReport = (
    rawReport: IronSourceReport[],
): Record<string, number> => Object.values(rawReport).reduce((acc, val) => {
    acc[val.appKey] = val.data.reduce((sum, { revenue }) => sum + revenue, 0);
    return acc;
}, {} as Record<string, number>);

const getBearerToken = async (): Promise<string> => {
    const res = await fetch(
        `${IRONSOURCE_AUTH_URL}`,
        {
            headers: {
                secretkey: process.env.IRONSOURCE_SECRET_KEY!,
                refreshToken: process.env.IRONSOURCE_REFRESH_TOKEN!,
            },
        },
    );
    return res.json();
};

const getYesterdayReport = async (
    startDate: string,
    endDate: string,
    bearerToken: string,
    adSource: string,
): Promise<IronSourceReport[]> => {
    const res = await fetch(
        `${IRONSOURCE_REPORTING_URL}?startDate=${startDate}&endDate=${endDate}&breakdown=app&ironSource&adSource=${adSource}`,
        {
            headers: {
                Authorization: `Bearer ${bearerToken}`,
            },
        },
    );
    return res.json();
};

const loadGoogleSheet = async (): Promise<Record<string, Sheet>> => {
    const creds = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON!);
    const doc: Doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID!);
    await doc.useServiceAccountAuth(creds);
    await doc.loadInfo();

    return loadAllSheets(doc);
};

const saveeCPMs = async (date: string, eCPMs: Record<string, number[]>): Promise<void> => {
    const ddb = new DynamoDB({ region: process.env.REGION });

    Object.entries(eCPMs).forEach(async ([app, eCPM]) => {
        const average = eCPM.reduce((sum, val) => sum + val, 0) / eCPM.length;

        await ddb.updateItem({
            Key: {
                clientId: { S: app },
                date: { S: date },
            },
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            TableName: process.env.INFO_TABLE_NAME!,
            UpdateExpression: 'SET #eCPM = :eCPM',
            ExpressionAttributeNames: { '#eCPM': 'eCPM' },
            ExpressionAttributeValues: DynamoDB.Converter.marshall({
                ':eCPM': average,
            }),
        }).promise();
    }, {});
};

const reporting = async (): Promise<void> => {
    const startDate = moment().subtract(1, 'day').startOf('day').format('YYYY-MM-DD');
    const endDate = moment().subtract(1, 'day').endOf('day').format('YYYY-MM-DD');

    const bearerToken = await getBearerToken();
    const reportsByAdNetwork = await Promise.all(
        AD_NETWORKS.map(
            (adSource) => getYesterdayReport(startDate, endDate, bearerToken, adSource),
        ),
    );

    const sheets = await loadGoogleSheet();
    const eCPMs = {};
    AD_NETWORKS.forEach(async (adNetwork, i) => {
        // Add row to google sheets
        const report = parseReport(reportsByAdNetwork[i]);
        sheets[adNetwork].addRow({
            Date: startDate,
            ...report,
        });

        // Add eCPM to save averages in database
        reportsByAdNetwork[i].forEach((appReport) => {
            eCPMs[appReport.appKey] = ([] as number[])
                .concat(appReport.data.map((data) => data.eCPM));
        });
    });

    await saveeCPMs(startDate, eCPMs);
};

export default reporting;
