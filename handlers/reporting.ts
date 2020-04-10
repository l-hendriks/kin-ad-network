/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { DynamoDB } from 'aws-sdk';
import fetch from 'node-fetch';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import moment from 'moment-es6';
import {
    Doc,
    Sheet,
    IronSourceReport,
    InformationObject,
} from '../constants';

const IRONSOURCE_AUTH_URL = 'https://platform.ironsrc.com/partners/publisher/auth';
const IRONSOURCE_REPORTING_URL = 'https://platform.ironsrc.com/partners/publisher/mediation/applications/v6/stats';
const AD_NETWORKS = ['ironSource', 'AdMob'];

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
        `${IRONSOURCE_REPORTING_URL}?startDate=${startDate}&endDate=${endDate}&breakdown=app&adSource=${adSource}`,
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

const calculateAverage = (eCPM: number[], impressions: number[]): number => {
    let totalImpressions = 0;
    let average = 0;
    for (let i = 0; i < eCPM.length; i += 1) {
        if (eCPM[i] > 0) {
            totalImpressions += impressions[i];
            average += eCPM[i] * impressions[i];
        }
    }

    if (totalImpressions === 0) {
        return 0;
    }

    return Math.round(100 * average / totalImpressions) / 100;
};

const saveInformation = async (
    date: string,
    eCPMs: Record<string, InformationObject>,
): Promise<void> => {
    const ddb = new DynamoDB({ region: process.env.REGION });

    for (let i = 0; i < Object.keys(eCPMs).length; i += 1) {
        const app = Object.keys(eCPMs)[i];
        const { eCPM, impressions, revenue } = eCPMs[app];
        const average = calculateAverage(eCPM, impressions);
        const totalRevenue = Math.round(100 * revenue.reduce((sum, val) => sum + val, 0)) / 100;

        // @TODO: Refactor this to a Promise.all
        // eslint-disable-next-line no-await-in-loop
        await ddb.updateItem({
            Key: {
                clientId: { S: app },
                date: { S: date },
            },
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            TableName: process.env.INFO_TABLE_NAME!,
            UpdateExpression: 'SET #eCPM = :eCPM, #revenue = :revenue',
            ExpressionAttributeNames: { '#eCPM': 'eCPM', '#revenue': 'revenue' },
            ExpressionAttributeValues: DynamoDB.Converter.marshall({
                ':eCPM': average,
                ':revenue': totalRevenue,
            }),
        }).promise();
    }
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
    const information = {};
    for (let i = 0; i < AD_NETWORKS.length; i += 1) {
        const adNetwork = AD_NETWORKS[i];
        // Add row to google sheets
        const report = parseReport(reportsByAdNetwork[i]);
        // @TODO: This can be more efficient with a Promise.all
        // eslint-disable-next-line no-await-in-loop
        await (sheets[adNetwork].addRow({
            Date: startDate,
            ...report,
        }));

        // Add eCPM to save averages in database
        reportsByAdNetwork[i].forEach(({ appKey, data }) => {
            if (!information[appKey]) {
                information[appKey] = {
                    eCPM: ([] as number[]).concat(data.map((record) => record.eCPM)),
                    impressions: ([] as number[]).concat(data.map((record) => record.impressions)),
                    revenue: ([] as number[]).concat(data.map((record) => record.revenue)),
                };
            } else {
                information[appKey].eCPM = information[appKey].eCPM
                    .concat(data.map((record) => record.eCPM));
                information[appKey].impressions = information[appKey].impressions
                    .concat(data.map((record) => record.impressions));
                information[appKey].revenue = information[appKey].revenue
                    .concat(data.map((record) => record.revenue));
            }
        });
    }

    await saveInformation(startDate, information);
};

export default reporting;
