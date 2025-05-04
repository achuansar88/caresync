
const AWS = require('aws-sdk');
const { sendResponse } = require('../utils');
// const isOffline = process.env.IS_OFFLINE === 'dev';
const isOffline = true;


const dynamoDB = new AWS.DynamoDB.DocumentClient({
    region: process.env.aws_region,
     credentials: {
       accessKeyId: process.env.AWS_ACC,   // Optional if aws-cli is configured
       secretAccessKey: process.env.AWS_SECR
     }
   });

exports.handler = async (event) => {
    const patientId = event.queryStringParameters?.patientId || '';

    // Fetch patient details
    const patientParams = {
        TableName: 'Patients',
        Key: { patientId: parseInt(patientId) }
    };
    const patient = await dynamoDB.get(patientParams).promise();

    console.log(patient);

    const filteredPatient = [patient.Item].map(item => {
        return {
            gender: item.gender,
            patientId: item.patientId,
            phone: item.phone,
            name: item.name,
            place: item.place
        };
    });
    let surgicals = [];
    patient.Item.procedure.forEach(surgical => {
        surgicals = [...surgicals, ...surgical.surgicals.map(item => ({ drugId: item.drugId }))];
    });

    const drugParams = {
        RequestItems: {
            Drugs: {
                Keys: [...surgicals, ...patient.Item.prescription.map(pres => ({ drugId: pres.drugId }))]
            }
        }
    };
    // Fetch drugs and procedures
    // const drugParams = {
    //     TableName: 'Drugs',
    //     Keys: patient.Item.prescription.map(pres => ({ drug: pres.drug }))
    // };


    const drugs = await dynamoDB.batchGet(drugParams).promise();
    // const procedureParams = {
    //     TableName: 'Procedures',
    //     Keys: patient.Item.procedure.map(proc => ({ procedureId: proc.procedureId }))
    // };


    const procedureParams = {
        RequestItems: {
            Procedures: {
                Keys: patient.Item.procedure.map(proc => ({ procedureId: proc.procedureId }))
            }
        }
    };

    // patient.Item.procedures.forEach(proc => {
    //     const procedure = procedures.find(p => p.procedure === proc.procedure);
    //     totalBill += procedure.rate;
    //     proc.surgicals.forEach(surg => {
    //         const surgical = drugs.find(d => d.drug === surg.item);
    //         totalBill += surg.quantity * surgical.mrpPerPiece;
    //     });
    // });

    const procedures = await dynamoDB.batchGet(procedureParams).promise();

    console.log('patient', JSON.stringify(patient));


const surgicalItems = patient.Item.procedure.flatMap((proc) => proc.surgicals);
const prescriptions = patient.Item.prescription;

const mergedDrugs = drugs.Responses.Drugs.map((drug) => {
    // For SURGICALS, add quantity
    if (drug.drugType === "SURGICALS") {
      const surgical = surgicalItems.find((s) => s.drugId === drug.drugId);
      if (surgical) {
        drug.quantity = surgical.quantity;
      }
    }
  
    // For TABLET, add days and frequency
    if (drug.drugType === "TABLET") {
      const prescription = prescriptions.find((p) => p.drugId === drug.drugId);
      if (prescription) {
        drug.days = prescription.days;
        drug.frequency = prescription.frequency;
      }
    }
  
    return drug;
  });

    return sendResponse(200, { message: "Patient", data: { 'patitent': filteredPatient[0], drugs: drugs.Responses.Drugs, procedures: procedures.Responses.Procedures } });

    // Calculate total bill
    // let totalBill = 0;
    // patient.Item.prescription.forEach(pres => {
    //     const drug = drugs.find(d => d.drug === pres.drug);
    //     const quantity = pres.frequency === 'TID' ? 3 : 2;
    //     totalBill += quantity * pres.days * drug.mrpPerPiece;
    // });

    // patient.Item.procedures.forEach(proc => {
    //     const procedure = procedures.find(p => p.procedure === proc.procedure);
    //     totalBill += procedure.rate;
    //     proc.surgicals.forEach(surg => {
    //         const surgical = drugs.find(d => d.drug === surg.item);
    //         totalBill += surg.quantity * surgical.mrpPerPiece;
    //     });
    // });

    // // Update stock counts
    // for (let drug of selectedDrugs) {
    //     const updateParams = {
    //         TableName: 'Drugs',
    //         Key: { drugId: drug.drugId },
    //         UpdateExpression: 'set balanceCount = balanceCount - :val',
    //         ExpressionAttributeValues: { ':val': drug.quantity }
    //     };
    //     await dynamoDb.update(updateParams).promise();
    // }

    // // Insert sale record
    // const saleParams = {
    //     TableName: 'Sales',
    //     Item: {
    //         saleId: AWS.util.uuid.v4(),
    //         patientId,
    //         totalBill,
    //         date: new Date().toISOString()
    //     }
    // };
    // await dynamoDb.put(saleParams).promise();

    // return {
    //     statusCode: 200,
    //     body: JSON.stringify({ totalBill })
    // };

    
};