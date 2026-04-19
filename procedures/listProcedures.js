require('dotenv').config();
const AWS = require('aws-sdk');
const { sendResponse } = require('../utils');
const isOffline = true;

const dynamoDB = new AWS.DynamoDB.DocumentClient({
    region: process.env.aws_region,
    credentials: {
        accessKeyId: process.env.AWS_ACC,
        secretAccessKey: process.env.AWS_SECR
    }
});

const PROCEDURES_TABLE = process.env.PROCEDURES_TABLE;

/**
 * List Procedures with optional search
 * Only returns active procedures (isDelete !== 1)
 */
exports.handler = async (event) => {
    const message = "Procedures listed successfully";
    const searchParam = event.queryStringParameters && event.queryStringParameters.search;

    let params = {
        TableName: PROCEDURES_TABLE,
        FilterExpression: 'attribute_not_exists(isDelete) OR isDelete = :isDeleteZero',
        ExpressionAttributeValues: {
            ':isDeleteZero': 0
        }
    };

    // If search param is provided, add filter expression
    if (searchParam && searchParam.trim() !== '') {
        params.FilterExpression += ' AND contains(procedures, :search)';
        params.ExpressionAttributeValues[':search'] = searchParam.toUpperCase();
    }

    try {
        const data = await dynamoDB.scan(params).promise();
        return sendResponse(200, { message, data: data.Items });
    } catch (error) {
        return sendResponse(500, { message: error.message, error });
    }
};