# Kin Ads Network IronSource Connector

This serverless function acts as a proxy between IronSource and the apps that are part of the Kin Ads network.
The goal of this function is to receive all IronSource callbacks and route them to the correct app, while keeping
a record of the event in a serverless database. This database will be used for realtime tracking, and for
duplicate event detection.

## How to use this as an app developer

Very simple! Integrate the IronSource SDK in your app per the instruction. As well as the required parameters,
send a custom variable called `clientId` with every request. Without this, the network doesn't know which
app the reward should be attributed to.

## How to run this as a developer

- Clone the script
- Run `yarn install`
- Run `yarn lint` for linting or `yarn coverage` for unit test coverage

To deploy the app, run `serverless deploy`. It will create an application in your linked AWS account on the
development stage. Refer to serverless docs for more information on deploying.

Deploying this app will automatically create 2 DynamoDB tables: clients and events. Clients link `clientId`s
to `callbackUrl`s. The events database is a database that saves all events that come through. A future 
possibility is to remove these after x days if the table becomes too big.

## Security measures

Two security measures have been implemented:

### Signature calculation

Per the docs of IronSource, an optional secret can be sent along with the request. This is the has of some
event properties and a secret variable, which is only visible in the IronSource dashboard and should
be saved in the AWS Secrets Manager, under a secret with the stage as name (configurable in serverless.yml)
and as key: `IRONSOURCE_PRIVATE_KEY`.

This way, the secret is safely stored in AWS Secrets Manager and can freely be accessed in the codebase
using `process.env.IRONSOURCE_PRIVATE_KEY`.

### Duplicate request are denied

With every request, a check is done to see if that request is already been rewarded before. If you happen
to have get a link of a video reward, you cannot run it again and get the reward again. As it is impossible
to generate new links that generate valid rewards (because you need to calculate the signature), you cannot
generate reward links without the secret nor reuse ones that were valid at some point.

## Callback response

If the `clientId` cannot be found, we log an error in AWS CloudWatch with the clientId in there so we
can monitor this. If it is found, the callback is always called with the following url:

`CALLBACK?eventId=EVENT_ID&rewards=REWARDS&timestamp=TIMESTAMP&userId=USER_ID&success=SUCCESS`

`success` is true if all checks passed and false if something went wrong. You do not get feedback on what
went wrong.

## Pricing

Running this has a fixed cost and a per-request cost. The costs are calculated per environment.
The fixed cost is $0.40 per month for the secrets manager. The per-request cost is roughly $5 per one
million ad calls. There is no scalability limit.