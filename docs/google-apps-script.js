// Google Apps Script - Deploy as Web App
// This script receives form data and saves it to Google Sheets and sends confirmation email
//
// SETUP CHECKLIST (required for email to work):
// 1. In Apps Script editor, run testEmail() manually first and grant all permissions
// 2. Deploy as Web App: Execute as "Me", Access "Anyone"
// 3. After any code change, deploy a NEW version (not update existing)
// 4. MailApp limit: 100 emails/day (free), 1500/day (Workspace)

function doPost(e) {
  var emailSent = false;
  var emailError = '';
  var uploadedFileUrl = '';
  var uploadedFileName = '';

  try {
    var rawBody = e.postData ? e.postData.contents : '';
    var contentType = e.postData && e.postData.type ? e.postData.type : '';
    var data = {};

    if (rawBody) {
      try {
        data = JSON.parse(rawBody);
      } catch (jsonError) {
        data = {
          type: getFormValue(e.parameter && e.parameter.type),
          name: getFormValue(e.parameter && e.parameter.name),
          gender: getFormValue(e.parameter && e.parameter.gender),
          organization: getFormValue(e.parameter && e.parameter.organization),
          phone: getFormValue(e.parameter && e.parameter.phone),
          email: getFormValue(e.parameter && e.parameter.email)
        };
      }
    }

    if (data.studentIdCard && data.studentIdCard.data) {
      try {
        var fileInfo = data.studentIdCard;
        var decodedBytes = Utilities.base64Decode(fileInfo.data);
        var blob = Utilities.newBlob(decodedBytes, fileInfo.mimeType || 'application/octet-stream', fileInfo.name || 'student-id-card');
        var savedFile = DriveApp.createFile(blob);
        uploadedFileUrl = savedFile.getUrl();
        uploadedFileName = savedFile.getName();
        Logger.log('Student ID card saved to Drive: ' + uploadedFileName);
      } catch (fileError) {
        Logger.log('Error saving student ID card: ' + fileError.toString());
      }
    } else {
      var uploadedFile = e.parameter && e.parameter.studentIdCard;
      if (uploadedFile && typeof uploadedFile === 'object' && uploadedFile.getBytes) {
        var fileNameBase = (data.name || 'student-id').replace(/[^a-zA-Z0-9._-]/g, '_');
        var safeFileName = 'student-id-' + fileNameBase + '-' + new Date().getTime();
        var savedFile = DriveApp.createFile(uploadedFile.setName(safeFileName));
        uploadedFileUrl = savedFile.getUrl();
        uploadedFileName = savedFile.getName();
      }
    }

    Logger.log('Received data: ' + JSON.stringify(data));

    const SHEET_ID = '1ySDbBD7NsV5qQfLCQGwGE_6pj6Gh73sCYMD9tRvdEyA';
    const sheet = SpreadsheetApp.openById(SHEET_ID).getActiveSheet();

    if (sheet.getLastRow() === 0) {
      sheet.appendRow(['Timestamp', 'Type', 'Name', 'Gender', 'Organization', 'Phone', 'Email', 'Email Sent', 'Student ID Card']);
    }

    if (data.email && data.email.trim() !== '') {
      try {
        sendConfirmationEmail(data, uploadedFileUrl);
        emailSent = true;
        Logger.log('Confirmation email sent to: ' + data.email);
      } catch (mailErr) {
        emailError = mailErr.toString();
        Logger.log('ERROR sending email: ' + emailError);
      }
    } else {
      emailError = 'No email address provided';
      Logger.log(emailError);
    }

    sheet.appendRow([
      new Date(),
      data.type || '',
      data.name || '',
      data.gender || '',
      data.organization || '',
      data.phone || '',
      data.email || '',
      emailSent ? 'Yes' : ('No: ' + emailError),
      uploadedFileUrl || ''
    ]);

    Logger.log('Data saved to sheet');

    return ContentService
      .createTextOutput(JSON.stringify({
        status: 'success',
        message: 'Form submitted successfully',
        email_sent: emailSent,
        email_error: emailError || null,
        student_id_card: uploadedFileUrl || null,
        student_id_card_name: uploadedFileName || null
      }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    Logger.log('Error in doPost: ' + error.toString());
    return ContentService
      .createTextOutput(JSON.stringify({
        status: 'error',
        message: error.toString(),
        email_sent: emailSent,
        email_error: emailError || null,
        student_id_card: uploadedFileUrl || null,
        student_id_card_name: uploadedFileName || null
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function getFormValue(value) {
  if (value === undefined || value === null) {
    return '';
  }
  if (Array.isArray(value)) {
    return String(value[0] || '');
  }
  return String(value);
}

// Function to send confirmation email
function sendConfirmationEmail(data, uploadedFileUrl) {
  var subject = "ការចុះឈ្មោះជោគជ័យ - Registration Successful";
  var fileLine = uploadedFileUrl ? "<p>📎 Student ID Card uploaded: <a href='" + uploadedFileUrl + "'>View file</a></p>" : '';
  
  var htmlMessage = "<p>Hello " + data.name + ",</p>" +
                "<p style='color:green; font-weight:bold;'>✅ ការចុះឈ្មោះជោគជ័យ - Successful Registration!</p>" +
                "<p>Thank you for registering for the Competition Research. Your data has been received and recorded successfully.</p>" +
                "<p>Here's a copy of your submission:<br>" +
                "---------------------------------<br>" +
                "Type: " + data.type + "<br>" +
                "Name: " + data.name + "<br>" +
                "Gender: " + data.gender + "<br>" +
                "Organization: " + data.organization + "<br>" +
                "Phone: " + data.phone + "<br>" +
                "Email: " + data.email + "<br>" +
                "---------------------------------</p>" +
                fileLine +
                "<p>More Information:<br>" +
                "🔹 <img src='https://cdn-icons-png.flaticon.com/512/2111/2111646.png' width='12' height='12'> " +
                "<a href='https://t.me/motresearchcompetiton'>Telegram Channel</a><br>" +
                "🔹 <img src='https://cdn-icons-png.flaticon.com/512/733/733547.png' width='12' height='12'> " +
                "<a href='https://www.facebook.com/share/1Bh4GkZFYR/'>Facebook Page</a><br>" +
                "🔹 <img src='https://cdn-icons-png.flaticon.com/512/724/724664.png' width='12' height='12'> " +
                "<a href='tel:095676763'>095676763</a></p>" +
                "<p>📎 <strong>ដាក់ស្នើឯកសារស្រាវជ្រាវ / Submit your research document:</strong><br>" +
                "<a href='https://tourism-research-policy.com/upload'>ទម្រង់ផ្ញើឯកសារ - Ministry Of Tourism</a></p>" +
                "<p>We appreciate your interest in the Competition Research and will respond within 24-48 hours.</p>" +
                "<p>Regards,<br>Ministry Of Tourism<br>Admin Team</p>";
  
  MailApp.sendEmail({
    to: data.email,
    subject: subject,
    htmlBody: htmlMessage
  });
}

// Handle GET requests - returns API status and quota info
function doGet(e) {
  var quotaRemaining = -1;
  try {
    quotaRemaining = MailApp.getRemainingDailyQuota();
  } catch (err) {
    // MailApp not authorized yet
  }
  return ContentService
    .createTextOutput(JSON.stringify({
      status: 'success',
      message: 'API is working',
      mail_quota_remaining: quotaRemaining
    }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ─── TEST FUNCTION ────────────────────────────────────────────────────────────
// Run this MANUALLY from the Apps Script editor (▶ Run > testEmail) to:
//   1. Grant MailApp permission (first run will show an auth dialog)
//   2. Verify email delivery works before going live
function testEmail() {
  var testData = {
    type: 'student',
    name: 'Test User',
    gender: 'male',
    organization: 'Test Org',
    phone: '012345678',
    email: Session.getActiveUser().getEmail() // sends to the script owner's email
  };
  try {
    sendConfirmationEmail(testData);
    Logger.log('✅ Test email sent successfully to: ' + testData.email);
    Logger.log('Remaining daily quota: ' + MailApp.getRemainingDailyQuota());
  } catch (err) {
    Logger.log('❌ Test email FAILED: ' + err.toString());
  }
}
