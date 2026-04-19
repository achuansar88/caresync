const { dynamodb } = require('../utils/db');
const { success, error } = require('../utils/responses');

const TABLE_INVOICE = process.env.INVOICE_TABLE || `${process.env.stage}InvoiceTable`;
const TABLE_PATIENTS = process.env.PATIENTS_TABLE || `${process.env.stage}Patients`;
const TABLE_MEDICINE = process.env.MEDICINE_TABLE || `${process.env.stage}MedicineTable`;

const isNumeric = (v) => /^-?\d+(\.\d+)?$/.test(String(v));

const getPatientInfo = async (patientIdVal) => {
  if (patientIdVal === undefined || patientIdVal === null) return null;
  try {
    const pid = isNumeric(patientIdVal) ? Number(patientIdVal) : patientIdVal;
    const getPatientParams = {
      TableName: TABLE_PATIENTS,
      Key: { patientId: pid }
    };
    const patientResp = await dynamodb.get(getPatientParams).promise();
    const p = patientResp.Item || null;
    if (p) {
      return {
        patientId: p.patientId,
        name: p.name,
        phone: p.phone || p.phoneNumber || null,
        place: p.place
      };
    }
  } catch (err) {
    console.error('Error fetching patient:', err);
  }
  return null;
};

module.exports.handler = async (event) => {
  try {
    const { 
      patientId, 
      paymentStatus, 
      startDate, 
      endDate, 
      invoiceId, 
      search,
      limit = 30,
      lastEvaluatedKey 
    } = event.queryStringParameters || {}

    // If invoiceId provided -> return full invoice details with patient and medicine info
    if (invoiceId) {
      // Get invoice
      const getInvoiceParams = {
        TableName: TABLE_INVOICE,
        Key: { invoiceId: invoiceId }
      };
      const invoiceResp = await dynamodb.get(getInvoiceParams).promise();
      const invoice = invoiceResp.Item;
      if (!invoice) return error({ message: 'Invoice not found', statusCode: 404 });

      // Get patient details if present (only return selected fields)
      let patient = null;
      if (invoice.patientId !== undefined && invoice.patientId !== null) {
        const pid = isNumeric(invoice.patientId) ? Number(invoice.patientId) : invoice.patientId;
        const getPatientParams = {
          TableName: TABLE_PATIENTS,
          Key: { patientId: pid }
        };
        const patientResp = await dynamodb.get(getPatientParams).promise();
        const p = patientResp.Item || null;
        if (p) {
          patient = {
            patientId: p.patientId,
            patientName: p.name,
            age: p.age,
            gender: p.gender,
            place: p.place,
            phoneNumber: p.phone || p.phoneNumber || null
          };
        }
      }
      // console.log('Items in invoice:', invoice);
      // Resolve medicine details for invoice items and for procedures inside items (if any)
      // Build unified items array from invoice.procedures and/or invoice.medicines (there is no invoice.items)
      // const items = [];

      // If there are medicines at the invoice root, add them as individual items so they will be resolved
      // if (Array.isArray(invoice.medicines)) {
      //   invoice.medicines.forEach(m => {
      //     if (!m) return;
      //     items.push({
      //   // preserve original fields but ensure common keys exist
      //   ...m,
      //   medicineId: m.medicineId || m.id || null,
      //   medicineType: m.medicineType || m.type || null
      //     });
      //   });
      // }

      // If there are procedures at the invoice root, add each procedure as an item with a procedures array
      // if (Array.isArray(invoice.procedures)) {
      //   invoice.procedures.forEach(p => {
      //     if (!p) return;
      //     const proc = {
      //   ...p,
      //   medicineId: p.medicineId || p.medicine_id || null,
      //   medicineType: p.medicineType || p.type || null
      //     };
      //     items.push({ procedures: [proc] });
      //   });
      // }

      // items is now a unified list (possibly empty) used later to collect medicineIds and merge details
      // const medicineIdsSet = new Set();

      // items.forEach(it => {
      //   if (it.medicineId) medicineIdsSet.add(it.medicineId);
      //   if (Array.isArray(it.procedures)) {
      //     it.procedures.forEach(proc => {
      //       if (proc.medicineId) medicineIdsSet.add(proc.medicineId);
      //     });
      //   }
      // });

      // const medicineIds = Array.from(medicineIdsSet);

      // let medicinesById = {};
      // if (medicineIds.length) {
        // batchGet supports up to 100 items; handle batching if needed
        // const batches = [];
        // for (let i = 0; i < medicineIds.length; i += 100) {
        //   batches.push(medicineIds.slice(i, i + 100));
        // }

        // for (const batch of batches) {
        //   const keys = batch.map(id => ({ medicineId: id }));
        //   const batchParams = {
        //     RequestItems: {
        //       [TABLE_MEDICINE]: {
        //         Keys: keys
        //       }
        //     }
        //   };
          // const batchResp = await dynamodb.batchGet(batchParams).promise();
          
        //   const returned = batchResp.Responses ? batchResp.Responses[TABLE_MEDICINE] || [] : [];
        //   returned.forEach(m => { medicinesById[m.medicineId] = m; });
        // }
      // }

      // Update invoice.procedures: add medicineName from medicinesById when available
      // if (Array.isArray(invoice.procedures)) {
      //   invoice.procedures = invoice.procedures.map(proc => {
      //     const p = { ...proc };
      //     if (p.medicineId && medicinesById[p.medicineId]) {
      //       p.medicineName = medicinesById[p.medicineId].medicineName;
      //     }
      //     return p;
      //   });
      // }

      // Update invoice.medicines (if present) similarly
      // if (Array.isArray(invoice.medicines)) {
      //   invoice.medicines = invoice.medicines.map(m => {
      //     const mm = { ...m };
      //     if (mm.medicineId && medicinesById[mm.medicineId]) {
      //       mm.medicineName = medicinesById[mm.medicineId].medicineName;
      //     }
      //     return mm;
      //   });
      // }

      // Build response without 'items' (remove items from output)
      const detailedInvoice = { ...invoice, patient };
      // if (detailedInvoice.items) delete detailedInvoice.items;
      return success(detailedInvoice);
    }

    // Existing behavior: queries/scans for lists
    let queryParams = {
      TableName: TABLE_INVOICE
    };

    // Use query when we have specific key conditions, otherwise use scan
    if (patientId) {
      // Query by patientId using GSI
      queryParams = {
        TableName: TABLE_INVOICE,
        IndexName: 'patientId-index',
        KeyConditionExpression: 'patientId = :patientId',
        ExpressionAttributeValues: {
          ':patientId': patientId
        },
        ScanIndexForward: false // Sort descending by date
      };

      if (startDate && endDate) {
        queryParams.KeyConditionExpression += ' AND createdDateTime BETWEEN :startDate AND :endDate';
        queryParams.ExpressionAttributeValues[':startDate'] = startDate;
        queryParams.ExpressionAttributeValues[':endDate'] = endDate;
      }
      
      const result = await dynamodb.query(queryParams).promise();
      
      // Enrich with patient info
      const enrichedItems = await Promise.all(
        result.Items.map(async (inv) => {
          const patientInfo = await getPatientInfo(inv.patientId);
          return {
            ...inv,
            patientName: patientInfo?.name || null,
            patientPhone: patientInfo?.phone || null
          };
        })
      );
      
      let response = { items: enrichedItems };
      if (result.LastEvaluatedKey) {
        response.lastEvaluatedKey = Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64');
      }
      return success(response);
      
    } else if (paymentStatus !== undefined) {
      // Query by payment status using GSI
      queryParams = {
        TableName: TABLE_INVOICE,
        IndexName: 'paymentStatus-index',
        KeyConditionExpression: 'paymentStatus = :paymentStatus',
        ExpressionAttributeValues: {
          ':paymentStatus': parseInt(paymentStatus)
        },
        Limit: limit,
        ScanIndexForward: false
      };

      if (startDate && endDate) {
        queryParams.KeyConditionExpression += ' AND createdDateTime BETWEEN :startDate AND :endDate';
        queryParams.ExpressionAttributeValues[':startDate'] = startDate;
        queryParams.ExpressionAttributeValues[':endDate'] = endDate;
      }
      
      const result = await dynamodb.query(queryParams).promise();
      
      // Enrich with patient info
      const enrichedItems = await Promise.all(
        result.Items.map(async (inv) => {
          const patientInfo = await getPatientInfo(inv.patientId);
          return {
            ...inv,
            patientName: patientInfo?.name || null,
            patientPhone: patientInfo?.phone || null
          };
        })
      );
      
      let response = { items: enrichedItems };
      if (result.LastEvaluatedKey) {
        response.lastEvaluatedKey = Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64');
      }
      return success(response);
      
    } else if (startDate && endDate) {
      // Query by date range using GSI
      queryParams = {
        TableName: TABLE_INVOICE,
        IndexName: 'createdDateTime-index',
        KeyConditionExpression: 'createdDateTime BETWEEN :startDate AND :endDate',
        ExpressionAttributeValues: {
          ':startDate': startDate,
          ':endDate': endDate
        },
        Limit: limit,
        ScanIndexForward: false
      };
      
      const result = await dynamodb.query(queryParams).promise();
      return success(result.Items);
      
    } else {
      // Scan all invoices (with limit for safety)
      queryParams.Limit = parseInt(limit);
      
      // Handle pagination
      if (lastEvaluatedKey) {
        try {
          queryParams.ExclusiveStartKey = JSON.parse(Buffer.from(lastEvaluatedKey, 'base64').toString('utf8'));
        } catch (e) {
          console.error('Invalid lastEvaluatedKey:', e);
        }
      }
      
      // For scan operations, we need to handle filters differently
      let result;
      
      // Apply paymentStatus filter if provided
      if (paymentStatus !== undefined && paymentStatus !== null && paymentStatus !== '') {
        queryParams.FilterExpression = 'paymentStatus = :paymentStatus';
        queryParams.ExpressionAttributeValues = {
          ':paymentStatus': parseInt(paymentStatus)
        };
      }
      
      // If there's a search query, we need to fetch more and filter
      if (search) {
        const searchLower = search.toLowerCase();
        // Fetch enough items to filter (higher limit for search)
        queryParams.Limit = parseInt(limit) * 5;
        
        result = await dynamodb.scan(queryParams).promise();
        
        // Filter by search query
        let filteredItems = [];
        
        for (const item of result.Items) {
          let matches = false;
          const patientIdVal = item.patientId;
          const invoiceIdVal = item.invoiceId;
          
          // Check direct fields
          if (invoiceIdVal && invoiceIdVal.toLowerCase().includes(searchLower)) {
            matches = true;
          } else if (patientIdVal && String(patientIdVal).toLowerCase().includes(searchLower)) {
            matches = true;
          }
          
          // If not matched yet, fetch patient info to search by name/phone
          if (!matches) {
            const patientInfo = await getPatientInfo(patientIdVal);
            if (patientInfo) {
              if (patientInfo.name && patientInfo.name.toLowerCase().includes(searchLower)) {
                matches = true;
              }
              if (patientInfo.phone && patientInfo.phone.includes(search)) {
                matches = true;
              }
            }
          }
          
          if (matches) {
            filteredItems.push(item);
          }
        }
        
        result.Items = filteredItems;
      } else {
        result = await dynamodb.scan(queryParams).promise();
      }
      
      // Sort by createdDateTime descending
      const allItems = result.Items.sort((a, b) => 
        new Date(b.createdDateTime).getTime() - new Date(a.createdDateTime).getTime()
      );
      
      // Fetch patient info for each invoice
      const enrichedItems = await Promise.all(
        allItems.map(async (inv) => {
          const patientInfo = await getPatientInfo(inv.patientId);
          return {
            ...inv,
            patientName: patientInfo?.name || null,
            patientPhone: patientInfo?.phone || null
          };
        })
      );
      
      // Build response with pagination info
      let response = {
        items: enrichedItems
      };
      
      if (result.LastEvaluatedKey) {
        response.lastEvaluatedKey = Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64');
      }
      
      return success(response);
    }
  } catch (err) {
    console.error('Error in listInvoices:', err);
    return error(err);
  }
};