/* eslint-disable @typescript-eslint/no-non-null-assertion */
import fetch from 'node-fetch';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import * as moment from 'moment';
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

const reporting = async (): Promise<void> => {
    const startDate = moment().subtract(1, 'day').startOf('day').format('YYYY-MM-DD');
    const endDate = moment().subtract(1, 'day').endOf('day').format('YYYY-MM-DD');

    const bearerToken = await getBearerToken();
    const reportsByAdNetwork = await Promise.all(
        AD_NETWORKS.map(
            (adSource) => getYesterdayReport(startDate, endDate, bearerToken, adSource),
        ),
    );

    const creds = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON!);
    const doc: Doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID!);
    await doc.useServiceAccountAuth(creds);
    await doc.loadInfo();

    const sheets = await loadAllSheets(doc);

    AD_NETWORKS.forEach(async (adNetwork, i) => {
        const report = {
            Date: startDate,
            ...parseReport(reportsByAdNetwork[i]),
        };
        sheets[adNetwork].addRow(report);
    });
};

export default reporting;
