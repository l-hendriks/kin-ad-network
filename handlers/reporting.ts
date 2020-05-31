/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { DynamoDB } from 'aws-sdk';
import moment from 'moment-es6';
import ironsourceReporting from '../reporters/ironsource';
import { IronSourceReportAppData, Client } from '../constants';

const getUserId = async (appId: string, network: string): Promise<Client|false> => {
    const ddb = new DynamoDB({ region: process.env.REGION });
    const { Items } = await ddb.query({
        ExpressionAttributeNames: { '#dataIdx': 'dataIdx' },
        ExpressionAttributeValues: { ':dataIdx': { S: `reporting#${network.toUpperCase()}#${appId}` } },
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        TableName: process.env.APPS_TABLE_NAME!,
        IndexName: 'dataIndex',
        KeyConditionExpression: '#dataIdx = :dataIdx',
    }).promise();

    if (!Items || Items.length === 0) {
        return false;
    }
    return DynamoDB.Converter.unmarshall(Items[0]) as Client;
};

const convertObjectToDDBExpression = (data: Record<string, string|number>) => {
    const names = Object.keys(data).reduce((acc, val) => {
        acc[`#${val}`] = val;
        return acc;
    }, {} as Record<string, string>);
    const values = Object.entries(data).reduce((acc, [key, value]) => {
        acc[`:${key}`] = value;
        return acc;
    }, {} as Record<string, string|number>);
    let expression = 'SET ';
    Object.keys(data).forEach((key) => { expression += `#${key} = :${key},`; });

    return {
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
        UpdateExpression: expression.slice(0, -1),
    };
};

const saveReport = async (
    appId: string,
    network: string,
    data: Record<string, string|number>,
    date: moment.Moment,
) => {
    // Get userId
    const user = await getUserId(appId, network);
    if (!user) {
        return false;
    }

    // Save record
    const dateMedationId = `${moment(date).format('YYYYMMDD')}#${network.toUpperCase()}#${appId}`;

    const params = {
        TableName: process.env.REPORTING_TABLE_NAME!,
        Key: { userId: user.userId, dateMedationId },
        ...convertObjectToDDBExpression(data),
    };
    const ddb = new DynamoDB.DocumentClient();
    return ddb.update(params).promise();
};

const parseReports = async (
    data: Record<string, Record<string, IronSourceReportAppData>>,
    date: moment.Moment,
) => {
    const apps = Object.keys(data);
    return Promise.all(apps.map((app) => {
        const networks = Object.keys(data[app]);
        return Promise.all(
            networks.map(
                (network) => saveReport(
                    app,
                    network,
                    data[app][network] as unknown as Record<string, string|number>,
                    date,
                ),
            ),
        );
    }));
};

const reporting = async (): Promise<void> => {
    const date = moment(1590415200000);
    const ironsourceData = await ironsourceReporting(date);
    await parseReports(ironsourceData, date);
};

export default reporting;
