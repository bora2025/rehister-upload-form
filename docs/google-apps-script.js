// Google Apps Script - Deploy as Web App
// This script receives form data and saves it to Google Sheets and sends confirmation email
//
// SETUP CHECKLIST (required for email to work):
// 1. In Apps Script editor, run testEmail() manually first and grant all permissions
// 2. Deploy as Web App: Execute as "Me", Access "Anyone"
// 3. After any code change, deploy a NEW version (not update existing)
// 4. MailApp limit: 100 emails/day (free), 1500/day (Workspace)

// CONFIGURATION: replace with your actual Sheet ID and target sheet name
const CONFIG = {
  SHEET_ID: '1AfSHKI-vkuoWkLdS91oWIHiCAg--4vwSngi_hKZE3SE',
  SHEET_NAME: 'Registrations',
  DRIVE_FOLDER_ID: '1y8wdyCIVNMrW6jn_2857-_6kCH9dUrb_'
};

const REGISTRATION_HEADERS = [
  'Timestamp',
  'Name',
  'Name (Latin)',
  'Gender',
  'Nationality',
  'Education Level',
  'Study Year',
  'Major',
  'Organization',
  'Phone',
  'Email',
  'Email Sent',
  'Student ID Card',
  'File Link'
];

function doPost(e) {
  var emailSent = false;
  var emailError = '';
  var uploadedFileUrl = '';
  var uploadedFileName = '';
  var uploadedFileUrls = [];
  var uploadedFileNames = [];
  var uploadedFilesByOwner = {};
  var fileErrors = [];

  try {
    var rawBody = (e.postData && e.postData.contents) ? e.postData.contents : '';
    var data = {};
    var filesData = [];

    if (rawBody) {
      try {
        data = JSON.parse(rawBody);
      } catch (jsonError) {
        Logger.log('JSON parse error: ' + jsonError.toString());
        data = {};
      }
    }

    if (data.files && Array.isArray(data.files)) {
      filesData = data.files;
    } else if (data.studentIdCard && data.studentIdCard.data) {
      filesData = [data.studentIdCard];
    }

    Logger.log('Received data: ' + JSON.stringify(data));
    Logger.log('Files in payload: ' + (filesData ? filesData.length : 0));

    var registrationType = sanitizeInput(data.registrationType || 'individual').toLowerCase();
    var teamSize = registrationType === 'team' ? Number(data.teamSize) : 1;
    if (registrationType !== 'individual' && registrationType !== 'team') {
      throw new Error('Invalid registration type.');
    }
    if (registrationType === 'team' && teamSize !== 2 && teamSize !== 3) {
      throw new Error('A team must have 2 or 3 members.');
    }
    if (!sanitizeInput(data.name) || !sanitizeInput(data.nameLatin) || !sanitizeInput(data.gender)) {
      throw new Error('Member 1 name and gender are required.');
    }
    var member1RequiredFields = ['nationality', 'educationLevel', 'studyYear', 'major', 'organization', 'phone', 'email'];
    if (member1RequiredFields.some(function(field) { return !sanitizeInput(data[field]); })) {
      throw new Error('All information is required for Member 1.');
    }
    if (registrationType === 'team' &&
        (!sanitizeInput(data.teamMember2Name) || !sanitizeInput(data.teamMember2NameLatin) || !sanitizeInput(data.teamMember2Gender))) {
      throw new Error('Member 2 name and gender are required.');
    }
    if (registrationType === 'team' && teamSize === 3 &&
        (!sanitizeInput(data.teamMember3Name) || !sanitizeInput(data.teamMember3NameLatin) || !sanitizeInput(data.teamMember3Gender))) {
      throw new Error('Member 3 name and gender are required.');
    }
    var member2RequiredFields = ['teamMember2Nationality', 'teamMember2EducationLevel', 'teamMember2StudyYear', 'teamMember2Major', 'teamMember2Organization', 'teamMember2Phone', 'teamMember2Email'];
    var member3RequiredFields = ['teamMember3Nationality', 'teamMember3EducationLevel', 'teamMember3StudyYear', 'teamMember3Major', 'teamMember3Organization', 'teamMember3Phone', 'teamMember3Email'];
    if (registrationType === 'team' && member2RequiredFields.some(function(field) { return !sanitizeInput(data[field]); })) {
      throw new Error('All information is required for Member 2.');
    }
    if (registrationType === 'team' && teamSize === 3 && member3RequiredFields.some(function(field) { return !sanitizeInput(data[field]); })) {
      throw new Error('All information is required for Member 3.');
    }
    var validGenders = ['male', 'female'];
    var submittedGenders = [String(data.gender || '').toLowerCase()];
    if (registrationType === 'team') submittedGenders.push(String(data.teamMember2Gender || '').toLowerCase());
    if (registrationType === 'team' && teamSize === 3) submittedGenders.push(String(data.teamMember3Gender || '').toLowerCase());
    if (submittedGenders.some(function(gender) { return validGenders.indexOf(gender) === -1; })) {
      throw new Error('Invalid gender selection.');
    }
    var submittedFileOwners = filesData.map(function(file, index) {
      return sanitizeInput(file.owner || (index === 0 ? 'member1' : '')).toLowerCase();
    });
    var requiredFileOwners = registrationType === 'team'
      ? (teamSize === 3 ? ['member1', 'member2', 'member3'] : ['member1', 'member2'])
      : ['member1'];
    if (requiredFileOwners.some(function(owner) { return submittedFileOwners.indexOf(owner) === -1; })) {
      throw new Error('A student ID card is required for every registered member.');
    }

    const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
    const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

    for (var i = 0; i < filesData.length; i++) {
      try {
        var fileData = filesData[i];
        var fileOwner = sanitizeInput(fileData.owner || (i === 0 ? 'member1' : '')).toLowerCase();

        if (!fileData || !fileData.data) {
          fileErrors.push('File ' + i + ': missing base64 data');
          continue;
        }

        var mimeType = (fileData.mimeType || 'application/octet-stream').toLowerCase();
        if (ALLOWED_MIME_TYPES.indexOf(mimeType) === -1) {
          fileErrors.push('File ' + i + ': invalid type ' + mimeType);
          continue;
        }

        var decodedBytes = Utilities.base64Decode(fileData.data);
        if (!decodedBytes || decodedBytes.length === 0) {
          fileErrors.push('File ' + i + ': empty decoded data');
          continue;
        }
        if (decodedBytes.length > MAX_FILE_SIZE) {
          fileErrors.push('File ' + i + ': exceeds 5MB limit');
          continue;
        }

        var blob = Utilities.newBlob(decodedBytes, mimeType, fileData.name || 'student-id-card');

        var targetFolder = null;
        try {
          targetFolder = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);
          Logger.log('Using target folder: ' + targetFolder.getName());
        } catch (folderError) {
          Logger.log('Could not access target folder, using Drive root: ' + folderError.toString());
          targetFolder = DriveApp.getRootFolder();
        }

        var savedFile = targetFolder.createFile(blob);
        var savedUrl = savedFile.getUrl();
        var savedName = savedFile.getName();
        uploadedFileUrls.push(savedUrl);
        uploadedFileNames.push(savedName);
        uploadedFilesByOwner[fileOwner] = { url: savedUrl, name: savedName };
        Logger.log('Student ID card saved to Drive: ' + savedName + ' | URL: ' + savedUrl);
      } catch (fileError) {
        var errMsg = 'Error saving student ID card ' + i + ': ' + fileError.toString();
        Logger.log(errMsg);
        fileErrors.push(errMsg);
      }
    }

    uploadedFileUrl = uploadedFileUrls.join(', ');
    uploadedFileName = uploadedFileNames.join(', ');

    if (requiredFileOwners.some(function(owner) { return !uploadedFilesByOwner[owner]; })) {
      throw new Error('A valid student ID card must be uploaded for every registered member. ' + fileErrors.join(' | '));
    }

    Logger.log('Opening spreadsheet: ' + CONFIG.SHEET_ID + ' | Sheet name: ' + CONFIG.SHEET_NAME);
    var spreadsheet = SpreadsheetApp.openById(CONFIG.SHEET_ID);
    var spreadsheetName = spreadsheet.getName();
    Logger.log('Spreadsheet name: ' + spreadsheetName);

    var sheet = spreadsheet.getSheetByName(CONFIG.SHEET_NAME);
    if (!sheet) {
      sheet = spreadsheet.insertSheet(CONFIG.SHEET_NAME);
      Logger.log('Created new sheet: ' + CONFIG.SHEET_NAME);
    }
    ensureRegistrationHeaders(sheet);
    Logger.log('Using fixed registration table: ' + CONFIG.SHEET_NAME + ' | Last row: ' + sheet.getLastRow());

    // Duplicate prevention: skip if the same email already exists in the sheet
    // Validate email format
    var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!data.email || !emailRegex.test(data.email.trim())) {
      return ContentService
        .createTextOutput(JSON.stringify({
          status: 'error',
          message: 'Invalid email address.'
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    if (registrationType === 'team' && !emailRegex.test(String(data.teamMember2Email || '').trim())) {
      throw new Error('Invalid email address for Member 2.');
    }
    if (registrationType === 'team' && teamSize === 3 && !emailRegex.test(String(data.teamMember3Email || '').trim())) {
      throw new Error('Invalid email address for Member 3.');
    }

    // Duplicate prevention: skip if the same email already exists in the sheet
    var emailToCheck = (data.email || '').trim().toLowerCase();
    if (emailToCheck) {
      var emailColumnIndex = REGISTRATION_HEADERS.indexOf('Email') + 1;
      var emailColumn = sheet.getRange(2, emailColumnIndex, Math.max(sheet.getLastRow() - 1, 1), 1).getValues();
      for (var r = 0; r < emailColumn.length; r++) {
        if (String(emailColumn[r][0] || '').trim().toLowerCase() === emailToCheck) {
          Logger.log('Duplicate submission detected for email: ' + data.email);
          return ContentService
            .createTextOutput(JSON.stringify({
              status: 'duplicate',
              message: 'This email has already been registered.',
              email: sanitizeInput(data.email)
            }))
            .setMimeType(ContentService.MimeType.JSON);
        }
      }
    }

    if (data.email && data.email.trim() !== '') {
      try {
        sendConfirmationEmail(data, uploadedFileUrl, uploadedFileName);
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

    function ownerFileUrl(owner) {
      return uploadedFilesByOwner[owner] ? uploadedFilesByOwner[owner].url : '';
    }
    function ownerFileLink(owner) {
      if (!uploadedFilesByOwner[owner]) return '';
      var safeLabel = String(uploadedFilesByOwner[owner].name || 'View file').replace(/"/g, '""');
      return '=HYPERLINK("' + uploadedFilesByOwner[owner].url + '","' + safeLabel + '")';
    }

    var registrationTimestamp = new Date();
    var emailStatus = emailSent ? 'Yes' : ('No: ' + emailError);
    var registrationRows = [{
      'Timestamp': registrationTimestamp,
      'Name': (registrationType === 'team' ? 'Team Member 1: ' : 'Individual: ') + sanitizeInput(data.name),
      'Name (Latin)': sanitizeInput(data.nameLatin),
      'Gender': sanitizeInput(data.gender),
      'Nationality': sanitizeInput(data.nationality),
      'Education Level': sanitizeInput(data.educationLevel),
      'Study Year': sanitizeInput(data.studyYear),
      'Major': sanitizeInput(data.major),
      'Organization': sanitizeInput(data.organization),
      'Phone': sanitizeInput(data.phone),
      'Email': sanitizeInput(data.email),
      'Email Sent': emailStatus,
      'Student ID Card': ownerFileUrl('member1'),
      'File Link': ownerFileLink('member1')
    }];

    if (registrationType === 'team') {
      registrationRows.push({
        'Timestamp': registrationTimestamp,
        'Name': 'Team Member 2: ' + sanitizeInput(data.teamMember2Name),
        'Name (Latin)': sanitizeInput(data.teamMember2NameLatin),
        'Gender': sanitizeInput(data.teamMember2Gender),
        'Nationality': sanitizeInput(data.teamMember2Nationality),
        'Education Level': sanitizeInput(data.teamMember2EducationLevel),
        'Study Year': sanitizeInput(data.teamMember2StudyYear),
        'Major': sanitizeInput(data.teamMember2Major),
        'Organization': sanitizeInput(data.teamMember2Organization),
        'Phone': sanitizeInput(data.teamMember2Phone),
        'Email': sanitizeInput(data.teamMember2Email),
        'Email Sent': emailStatus,
        'Student ID Card': ownerFileUrl('member2'),
        'File Link': ownerFileLink('member2')
      });
    }

    if (registrationType === 'team' && teamSize === 3) {
      registrationRows.push({
        'Timestamp': registrationTimestamp,
        'Name': 'Team Member 3: ' + sanitizeInput(data.teamMember3Name),
        'Name (Latin)': sanitizeInput(data.teamMember3NameLatin),
        'Gender': sanitizeInput(data.teamMember3Gender),
        'Nationality': sanitizeInput(data.teamMember3Nationality),
        'Education Level': sanitizeInput(data.teamMember3EducationLevel),
        'Study Year': sanitizeInput(data.teamMember3StudyYear),
        'Major': sanitizeInput(data.teamMember3Major),
        'Organization': sanitizeInput(data.teamMember3Organization),
        'Phone': sanitizeInput(data.teamMember3Phone),
        'Email': sanitizeInput(data.teamMember3Email),
        'Email Sent': emailStatus,
        'Student ID Card': ownerFileUrl('member3'),
        'File Link': ownerFileLink('member3')
      });
    }

    registrationRows.forEach(function(row) {
      appendRegistrationRow(sheet, row);
    });

    Logger.log('Data saved to sheet');

    return ContentService
      .createTextOutput(JSON.stringify({
        status: 'success',
        message: 'Form submitted successfully',
        script_version: '2026-08-22-v8',
        sheet_id: CONFIG.SHEET_ID,
        sheet_name: CONFIG.SHEET_NAME,
        debug: {
          file_count: filesData.length,
          uploaded_url: uploadedFileUrl,
          uploaded_name: uploadedFileName,
          file_errors: fileErrors
        },
        email_sent: emailSent,
        email_error: emailError || null,
        student_id_card: uploadedFileUrl || null,
        student_id_card_name: uploadedFileName || null,
        file_errors: fileErrors.length > 0 ? fileErrors : null
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
        student_id_card_name: uploadedFileName || null,
        file_errors: fileErrors.length > 0 ? fileErrors : null
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

// Enforces one fixed 14-column table and prevents columns being appended again.
function ensureRegistrationHeaders(sheet) {
  var requiredColumnCount = REGISTRATION_HEADERS.length;
  var maximumColumnCount = sheet.getMaxColumns();

  if (maximumColumnCount < requiredColumnCount) {
    sheet.insertColumnsAfter(maximumColumnCount, requiredColumnCount - maximumColumnCount);
  }

  sheet.getRange(1, 1, 1, requiredColumnCount).setValues([REGISTRATION_HEADERS]);

  maximumColumnCount = sheet.getMaxColumns();
  if (maximumColumnCount > requiredColumnCount) {
    sheet.deleteColumns(requiredColumnCount + 1, maximumColumnCount - requiredColumnCount);
    Logger.log('Removed columns after File Link. Registration table now has exactly 14 columns.');
  }

  sheet.setFrozenRows(1);
}

// Always writes exactly 14 values in the fixed schema order.
function appendRegistrationRow(sheet, valuesByHeader) {
  var row = REGISTRATION_HEADERS.map(function(header) {
    return Object.prototype.hasOwnProperty.call(valuesByHeader, header) ? valuesByHeader[header] : '';
  });
  sheet.getRange(sheet.getLastRow() + 1, 1, 1, REGISTRATION_HEADERS.length).setValues([row]);
}

// Run once manually after deploying to repair an existing expanded table immediately.
function repairRegistrationTable() {
  var spreadsheet = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  var sheet = spreadsheet.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(CONFIG.SHEET_NAME);
  }
  ensureRegistrationHeaders(sheet);
  Logger.log('Registration table repaired: ' + REGISTRATION_HEADERS.join(', '));
}

function sanitizeInput(value) {
  if (value === undefined || value === null) {
    return '';
  }
  return String(value)
    .replace(/\u003cscript[^\u003e]*\u003e.*?\u003c\/script\u003e/gi, '')
    .replace(/\u003cscript[^\u003e]*\u003e/gi, '')
    .replace(/\u003c\/script\u003e/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '');
}

// Function to send confirmation email
function sendConfirmationEmail(data, uploadedFileUrl, uploadedFileName) {
  var subject = "ការចុះឈ្មោះជោគជ័យ - Registration Successful";
  var linkLabel = uploadedFileName || 'View file';
  var fileLine = uploadedFileUrl ? "<p>📎 Student ID Card uploaded: <a href='" + uploadedFileUrl + "'>" + linkLabel + "</a></p>" : '';
  
  var safeData = {
    registrationType: sanitizeInput(data.registrationType || 'individual'),
    teamSize: sanitizeInput(data.teamSize || '1'),
    name: sanitizeInput(data.name),
    nameLatin: sanitizeInput(data.nameLatin),
    gender: sanitizeInput(data.gender),
    teamMember2Name: sanitizeInput(data.teamMember2Name),
    teamMember2NameLatin: sanitizeInput(data.teamMember2NameLatin),
    teamMember2Gender: sanitizeInput(data.teamMember2Gender),
    teamMember2Nationality: sanitizeInput(data.teamMember2Nationality),
    teamMember2EducationLevel: sanitizeInput(data.teamMember2EducationLevel),
    teamMember2StudyYear: sanitizeInput(data.teamMember2StudyYear),
    teamMember2Major: sanitizeInput(data.teamMember2Major),
    teamMember2Organization: sanitizeInput(data.teamMember2Organization),
    teamMember2Phone: sanitizeInput(data.teamMember2Phone),
    teamMember2Email: sanitizeInput(data.teamMember2Email),
    teamMember3Name: sanitizeInput(data.teamMember3Name),
    teamMember3NameLatin: sanitizeInput(data.teamMember3NameLatin),
    teamMember3Gender: sanitizeInput(data.teamMember3Gender),
    teamMember3Nationality: sanitizeInput(data.teamMember3Nationality),
    teamMember3EducationLevel: sanitizeInput(data.teamMember3EducationLevel),
    teamMember3StudyYear: sanitizeInput(data.teamMember3StudyYear),
    teamMember3Major: sanitizeInput(data.teamMember3Major),
    teamMember3Organization: sanitizeInput(data.teamMember3Organization),
    teamMember3Phone: sanitizeInput(data.teamMember3Phone),
    teamMember3Email: sanitizeInput(data.teamMember3Email),
    nationality: sanitizeInput(data.nationality),
    educationLevel: sanitizeInput(data.educationLevel),
    studyYear: sanitizeInput(data.studyYear),
    major: sanitizeInput(data.major),
    organization: sanitizeInput(data.organization),
    phone: sanitizeInput(data.phone),
    email: sanitizeInput(data.email)
  };

  var teamDetails = '';
  if (safeData.registrationType === 'team') {
    teamDetails = "Registration Type: Team (" + safeData.teamSize + " members)<br>" +
      "Member 1 / Team Leader: " + safeData.name + " (" + safeData.nameLatin + ", " + safeData.gender + ")<br>" +
      "Member 2: " + safeData.teamMember2Name + " (" + safeData.teamMember2NameLatin + ", " + safeData.teamMember2Gender + ")<br>" +
      "Member 2 Study: " + safeData.teamMember2EducationLevel + ", " + safeData.teamMember2StudyYear + ", " + safeData.teamMember2Major + ", " + safeData.teamMember2Organization + "<br>" +
      "Member 2 Contact: " + safeData.teamMember2Phone + ", " + safeData.teamMember2Email + "<br>";
    if (safeData.teamSize === '3') {
      teamDetails += "Member 3: " + safeData.teamMember3Name + " (" + safeData.teamMember3NameLatin + ", " + safeData.teamMember3Gender + ")<br>" +
        "Member 3 Study: " + safeData.teamMember3EducationLevel + ", " + safeData.teamMember3StudyYear + ", " + safeData.teamMember3Major + ", " + safeData.teamMember3Organization + "<br>" +
        "Member 3 Contact: " + safeData.teamMember3Phone + ", " + safeData.teamMember3Email + "<br>";
    }
  } else {
    teamDetails = "Registration Type: Individual<br>";
  }

  var htmlMessageBody = "<p style='color:green; font-weight:bold;'>✅ ការចុះឈ្មោះជោគជ័យ - Successful Registration!</p>" +
                "<p>Thank you for registering for the Competition Research. Your data has been received and recorded successfully.</p>" +
                "<p>Here's a copy of your submission:<br>" +
                "---------------------------------<br>" +
                teamDetails +
                "Name: " + safeData.name + "<br>" +
                "Name (Latin): " + safeData.nameLatin + "<br>" +
                "Gender: " + safeData.gender + "<br>" +
                "Nationality: " + safeData.nationality + "<br>" +
                "Education Level: " + safeData.educationLevel + "<br>" +
                "Study Year: " + safeData.studyYear + "<br>" +
                "Major: " + safeData.major + "<br>" +
                "Organization: " + safeData.organization + "<br>" +
                "Phone: " + safeData.phone + "<br>" +
                "Email: " + safeData.email + "<br>" +
                "---------------------------------</p>" +
                fileLine +
                "<p>More Information:<br>" +
                "🔹 <img src='https://cdn-icons-png.flaticon.com/512/2111/2111646.png' width='12' height='12'> " +
                "<a href='https://t.me/+O8E1NI5QxwJlMjQ1'>Telegram Channel</a><br>" +
                "🔹 <img src='https://cdn-icons-png.flaticon.com/512/733/733547.png' width='12' height='12'> " +
                "<a href='https://www.facebook.com/share/1Bh4GkZFYR/'>Facebook Page</a><br>" +
                "🔹 <img src='https://cdn-icons-png.flaticon.com/512/724/724664.png' width='12' height='12'> " +
                "<a href='tel:095676763'>095676763</a></p>" +
                "<p>📎 <strong>ដាក់ស្នើឯកសារស្រាវជ្រាវ / Submit your research document:</strong><br>" +
                "<a href='https://tourism-research-policy.com/upload'>ទម្រង់ផ្ញើឯកសារ - Ministry Of Tourism</a></p>" +
                "<p>We appreciate your interest in the Competition Research and will respond within 24-48 hours.</p>" +
                "<p>Regards,<br>Ministry Of Tourism<br>Admin Team</p>";
  
  var recipients = [{ email: safeData.email, name: safeData.name }];
  if (safeData.registrationType === 'team') {
    recipients.push({ email: safeData.teamMember2Email, name: safeData.teamMember2Name });
    if (safeData.teamSize === '3') {
      recipients.push({ email: safeData.teamMember3Email, name: safeData.teamMember3Name });
    }
  }

  recipients.forEach(function(recipient) {
    if (!recipient.email) return;
    MailApp.sendEmail({
      to: recipient.email,
      subject: subject,
      htmlBody: "<p>Hello " + recipient.name + "</p>" + htmlMessageBody
    });
    Logger.log('Registration confirmation sent directly to: ' + recipient.email);
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
    name: 'Test User',
    nameLatin: 'Test User',
    gender: 'male',
    nationality: 'Cambodian',
    educationLevel: 'បរិញ្ញាបត្រ',
    studyYear: 'ឆ្នាំទី១',
    major: 'Tourism Management',
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
