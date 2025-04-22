const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand } = require("@aws-sdk/lib-dynamodb");

const client = new DynamoDBClient({
  region: "ap-south-1",
  endpoint: "http://localhost:8000", // For local DynamoDB
  credentials: {
    accessKeyId: "MockAccessKeyId",
    secretAccessKey: "MockSecretAccessKey",
  },
});
// import { DynamoDBClient } from '@aws-sdk/client-dynamodb';

// const dynamoDB = new AWS.DynamoDB.DocumentClient({
//   region: 'localhost',
//   endpoint: 'http://localhost:8000',
//   accessKeyId: 'MockAccessKeyId',
//   secretAccessKey: 'MockSecretAccessKey',
// });
const dynamoDB = DynamoDBDocumentClient.from(client);
// const client = new DynamoDBClient({
//   region: 'localhost',
//   endpoint: 'http://localhost:8000',
//   credentials: {
//     accessKeyId: 'MockAccessKeyId',
//     secretAccessKey: 'MockSecretAccessKey'
//   },
// })

const params = {
  TableName: "CounterTable",
  Item: {
    counterName: "patientIdCounter",
    counterValue: 0,
  },
};

dynamoDB.send(
  new PutCommand(params)
);