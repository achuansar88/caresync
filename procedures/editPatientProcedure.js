// Lambda to edit a patient procedure (only if not confirmed)
const AWS = require('aws-sdk');
const docClient = new AWS.DynamoDB.DocumentClient();
const TABLE = process.env.PATIENT_PROCEDURE_TABLE || `${process.env.stage || 'dev'}PatientProcedureTable`;

exports.handler = async (event) => {
  try {
    const patientProcedureId = event.pathParameters.patientProcedureId;
    const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    // Fetch current item
    const { Item } = await docClient.get({ TableName: TABLE, Key: { patientProcedureId } }).promise();
    if (!Item) return { statusCode: 404, body: JSON.stringify({ message: 'Not found' }) };
    if (Item.status === 1) return { statusCode: 400, body: JSON.stringify({ message: 'Cannot edit confirmed procedure' }) };
    // Update fields
    const updateExp = [];
    const expAttr = {};
    if (body.requirements) { updateExp.push('#r = :r'); expAttr[':r'] = body.requirements; }
    if (body.procedure) { updateExp.push('#p = :p'); expAttr[':p'] = body.procedure; }
    if (body.additionalInfo) { updateExp.push('#a = :a'); expAttr[':a'] = body.additionalInfo; }
    if (updateExp.length === 0) return { statusCode: 400, body: JSON.stringify({ message: 'No fields to update' }) };
    await docClient.update({
      TableName: TABLE,
      Key: { patientProcedureId },
      UpdateExpression: 'SET ' + updateExp.join(', '),
      ExpressionAttributeNames: { '#r': 'requirements', '#p': 'procedure', '#a': 'additionalInfo' },
      ExpressionAttributeValues: expAttr,
    }).promise();
    return { statusCode: 200, body: JSON.stringify({ message: 'Updated' }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ message: err.message }) };
  }
};
