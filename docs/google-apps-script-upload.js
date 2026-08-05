// Google Apps Script for Upload Document Form
// Deploy as Web App with permissions to access Drive and send emails

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

function escapeHtml(value) {
  if (value === undefined || value === null) {
    return '';
  }
  return String(value)
    .replace(/\u0026/g, '&amp;')
    .replace(/\u003c/g, '&lt;')
    .replace(/\u003e/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const UPLOAD_HEADERS = [
  'Timestamp',
  'Submission Type',
  'Author Name',
  'Author Gender',
  'Team Member 1',
  'Team Member 1 Gender',
  'Team Member 2',
  'Team Member 2 Gender',
  'Team Member 3',
  'Team Member 3 Gender',
  'Email',
  'Phone',
  'Document Title',
  'Video URL',
  'Files',
  'File URLs'
];

// Migrates the previous Uploads sheet without deleting existing submissions.
function ensureUploadHeaders(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(UPLOAD_HEADERS);
    return;
  }

  var columnCount = Math.max(sheet.getLastColumn(), 1);
  var headers = sheet.getRange(1, 1, 1, columnCount).getValues()[0];

  if (headers[1] !== 'Submission Type') {
    sheet.insertColumnAfter(1);
    Logger.log('Inserted Submission Type column');
    columnCount = Math.max(sheet.getLastColumn(), 1);
    headers = sheet.getRange(1, 1, 1, columnCount).getValues()[0];
  }

  var hasTeamColumns = headers.indexOf('Team Member 1') !== -1 &&
    headers.indexOf('Team Member 2') !== -1 &&
    headers.indexOf('Team Member 3') !== -1;
  if (!hasTeamColumns) {
    sheet.insertColumnsAfter(3, 3);
    Logger.log('Inserted three Team Member columns');
  }

  columnCount = Math.max(sheet.getLastColumn(), 1);
  headers = sheet.getRange(1, 1, 1, columnCount).getValues()[0];
  if (headers.indexOf('Author Gender') === -1) {
    // Insert right-to-left so existing submission data remains aligned.
    sheet.insertColumnAfter(6);
    sheet.insertColumnAfter(5);
    sheet.insertColumnAfter(4);
    sheet.insertColumnAfter(3);
    Logger.log('Inserted individual and team gender columns');
  }

  sheet.getRange(1, 1, 1, UPLOAD_HEADERS.length).setValues([UPLOAD_HEADERS]);
  sheet.setFrozenRows(1);
}

function doPost(e) {
  try {
    Logger.log('=== Upload Request Started ===');
    
    // Replace with your Google Sheet ID
    var SHEET_ID = '1JQ8pBwlat2rCgCM9VpPnGrv2Op7jvha8T4L-4MKS33w';
    
    // Debug: Write raw request to sheet
    var spreadsheet = SpreadsheetApp.openById(SHEET_ID);
    var debugSheet = spreadsheet.getSheetByName('Debug');
    if (!debugSheet) {
      debugSheet = spreadsheet.insertSheet('Debug');
      debugSheet.appendRow(['Timestamp', 'postData.contents', 'postData.type', 'Error']);
    }
    
    try {
      debugSheet.appendRow([
        new Date(),
        e.postData ? e.postData.contents.substring(0, 1000) : 'NO POSTDATA',
        e.postData ? e.postData.type : 'N/A',
        ''
      ]);
    } catch (debugError) {
      // Continue even if debug fails
    }
    
    // Parse JSON data
    var jsonData = JSON.parse(e.postData.contents);
    
    var submissionType = sanitizeInput(jsonData.submissionType || 'individual').toLowerCase();
    var authorName = sanitizeInput(jsonData.authorName || '');
    var authorGender = sanitizeInput(jsonData.authorGender || '').toLowerCase();
    var teamMember1 = sanitizeInput(jsonData.teamMember1 || '');
    var teamMember1Gender = sanitizeInput(jsonData.teamMember1Gender || '').toLowerCase();
    var teamMember2 = sanitizeInput(jsonData.teamMember2 || '');
    var teamMember2Gender = sanitizeInput(jsonData.teamMember2Gender || '').toLowerCase();
    var teamMember3 = sanitizeInput(jsonData.teamMember3 || '');
    var teamMember3Gender = sanitizeInput(jsonData.teamMember3Gender || '').toLowerCase();
    var email = sanitizeInput(jsonData.email || '');
    var phone = sanitizeInput(jsonData.phone || '');
    var documentTitle = sanitizeInput(jsonData.documentTitle || '');
    var videoUrl = sanitizeInput(jsonData.videoUrl || '');
    var filesData = jsonData.files || [];

    if (submissionType !== 'individual' && submissionType !== 'team') {
      throw new Error('Invalid submission type.');
    }
    if (submissionType === 'individual' && (!authorName || !authorGender)) {
      throw new Error('Author name and gender are required for an individual upload.');
    }
    if (submissionType === 'team' && (!teamMember1 || !teamMember1Gender || !teamMember2 || !teamMember2Gender || !teamMember3 || !teamMember3Gender)) {
      throw new Error('Names and genders are required for all three team members.');
    }
    var validGenders = ['male', 'female'];
    var submittedGenders = submissionType === 'team'
      ? [teamMember1Gender, teamMember2Gender, teamMember3Gender]
      : [authorGender];
    if (submittedGenders.some(function(gender) { return validGenders.indexOf(gender) === -1; })) {
      throw new Error('Invalid gender selection.');
    }

    // Validate email format
    var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email.trim())) {
      return ContentService
        .createTextOutput(JSON.stringify({
          status: 'error',
          message: 'Invalid email address.'
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // Allowed file types and max size (10 MB)
    const ALLOWED_MIME_TYPES = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    const MAX_FILE_SIZE = 10 * 1024 * 1024;
    
    Logger.log('Author Name: ' + authorName);
    Logger.log('Submission Type: ' + submissionType);
    Logger.log('Email: ' + email);
    Logger.log('Document Title: ' + documentTitle);
    Logger.log('Number of files: ' + filesData.length);
    
    var files = [];
    
    // Process uploaded files
    if (filesData && filesData.length > 0) {
      var folderId = '1y8wdyCIVNMrW6jn_2857-_6kCH9dUrb_';
      
      try {
        var folder = DriveApp.getFolderById(folderId);
        Logger.log('Folder found: ' + folder.getName());
        
        // Debug: write to debug sheet
        try {
          debugSheet.appendRow([new Date(), 'Processing ' + filesData.length + ' files', '', '']);
        } catch (e) {}
        
        for (var i = 0; i < filesData.length; i++) {
          try {
            var fileData = filesData[i];
            
            // Debug log
            try {
              debugSheet.appendRow([new Date(), 'Processing file: ' + fileData.name, fileData.mimeType, '']);
            } catch (e) {}
            
            // Validate file type and size
            var mimeType = (fileData.mimeType || 'application/octet-stream').toLowerCase();
            if (ALLOWED_MIME_TYPES.indexOf(mimeType) === -1) {
              throw new Error('Invalid file type: ' + mimeType);
            }
            var decoded = Utilities.base64Decode(fileData.data);
            if (!decoded || decoded.length === 0) {
              throw new Error('Empty file data');
            }
            if (decoded.length > MAX_FILE_SIZE) {
              throw new Error('File exceeds 10MB limit');
            }

            // Decode base64 and create blob
            var blob = Utilities.newBlob(decoded);
            blob.setName(sanitizeInput(fileData.name) || 'uploaded-file');
            blob.setContentType(mimeType);
            
            // Create file in Drive
            var file = folder.createFile(blob);
            var uploaderNames = submissionType === 'team'
              ? [teamMember1, teamMember2, teamMember3].join(', ')
              : authorName;
            file.setDescription('Submission type: ' + submissionType + ' | Uploaded by: ' + escapeHtml(uploaderNames) + ' | Email: ' + escapeHtml(email) + ' | Phone: ' + escapeHtml(phone) + ' | Title: ' + escapeHtml(documentTitle));
            
            files.push({
              name: file.getName(),
              url: file.getUrl(),
              id: file.getId()
            });
            
            Logger.log('File uploaded successfully: ' + file.getName());
            
            // Debug success
            try {
              debugSheet.appendRow([new Date(), 'SUCCESS: ' + file.getName(), file.getUrl(), '']);
            } catch (e) {}
            
          } catch (fileError) {
            Logger.log('Error uploading file ' + i + ': ' + fileError.toString());
            // Debug error
            try {
              debugSheet.appendRow([new Date(), 'FILE ERROR ' + i, '', fileError.toString()]);
            } catch (e) {}
          }
        }
      } catch (driveError) {
        Logger.log('Error accessing Drive folder: ' + driveError.toString());
        // Debug error
        try {
          debugSheet.appendRow([new Date(), 'DRIVE ERROR', '', driveError.toString()]);
        } catch (e) {}
        throw new Error('Cannot access Google Drive folder: ' + driveError.message);
      }
    } else {
      Logger.log('WARNING: No files found in request');
      try {
        debugSheet.appendRow([new Date(), 'WARNING: No files in filesData', 'Length: ' + (filesData ? filesData.length : 'null'), '']);
      } catch (e) {}
    }
    
    // Save metadata to Google Sheet
    try {
      var spreadsheet = SpreadsheetApp.openById(SHEET_ID);
      Logger.log('Spreadsheet opened successfully');
      
      // Create or get "Uploads" sheet
      var uploadsSheet = spreadsheet.getSheetByName('Uploads');
      if (!uploadsSheet) {
        uploadsSheet = spreadsheet.insertSheet('Uploads');
        uploadsSheet.appendRow(UPLOAD_HEADERS);
      } else {
        ensureUploadHeaders(uploadsSheet);
      }
      
      // Prepare file info for sheet
      var fileNames = files.length > 0 ? files.map(function(f) { return f.name; }).join(', ') : 'No files uploaded';
      var fileUrls = files.length > 0 ? files.map(function(f) { return f.url; }).join(', ') : '';
      // For a team, also store Member 1 as the primary author/team leader so the
      // shared Author columns are not blank in the spreadsheet.
      var primaryAuthorName = submissionType === 'team' ? teamMember1 : authorName;
      var primaryAuthorGender = submissionType === 'team' ? teamMember1Gender : authorGender;

      // Add to sheet
      uploadsSheet.appendRow([
        new Date(),
        submissionType,
        primaryAuthorName,
        primaryAuthorGender,
        teamMember1,
        teamMember1Gender,
        teamMember2,
        teamMember2Gender,
        teamMember3,
        teamMember3Gender,
        email,
        phone,
        documentTitle,
        videoUrl,
        sanitizeInput(fileNames),
        fileUrls
      ]);
      
      Logger.log('Metadata saved to sheet');
    } catch (sheetError) {
      Logger.log('Error saving to sheet: ' + sheetError.toString());
      // Don't throw error - allow upload to succeed even if sheet save fails
      Logger.log('Upload will continue despite sheet error');
    }
    
    // Send confirmation email
    if (email && email.trim() !== '') {
      try {
        sendUploadConfirmationEmail({
          submissionType: submissionType,
          authorName: authorName,
          authorGender: authorGender,
          teamMember1: teamMember1,
          teamMember1Gender: teamMember1Gender,
          teamMember2: teamMember2,
          teamMember2Gender: teamMember2Gender,
          teamMember3: teamMember3,
          teamMember3Gender: teamMember3Gender,
          email: email,
          phone: phone,
          documentTitle: documentTitle,
          videoUrl: videoUrl,
          files: files
        });
        Logger.log('Confirmation email sent to: ' + email);
      } catch (emailError) {
        Logger.log('Error sending email: ' + emailError.toString());
      }
    }
    
    // Return success response
    return ContentService
      .createTextOutput(JSON.stringify({
        status: 'success',
        message: 'Document(s) uploaded successfully',
        files: files
      }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    Logger.log('Error in doPost: ' + error.toString());
    return ContentService
      .createTextOutput(JSON.stringify({
        status: 'error',
        message: error.toString()
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Function to send upload confirmation email
function sendUploadConfirmationEmail(data) {
  var subject = "ការផ្ទុកឯកសារជោគជ័យ - Document Upload Successful";
  
  // Build file list HTML
  var safeData = {
    submissionType: escapeHtml(data.submissionType),
    authorName: escapeHtml(data.authorName),
    authorGender: escapeHtml(data.authorGender),
    teamMember1: escapeHtml(data.teamMember1),
    teamMember1Gender: escapeHtml(data.teamMember1Gender),
    teamMember2: escapeHtml(data.teamMember2),
    teamMember2Gender: escapeHtml(data.teamMember2Gender),
    teamMember3: escapeHtml(data.teamMember3),
    teamMember3Gender: escapeHtml(data.teamMember3Gender),
    email: escapeHtml(data.email),
    phone: escapeHtml(data.phone),
    documentTitle: escapeHtml(data.documentTitle),
    videoUrl: escapeHtml(data.videoUrl)
  };

  var fileListHtml = '';
  if (data.files && data.files.length > 0) {
    fileListHtml = '<ul style="margin: 10px 0; padding-left: 20px;">';
    data.files.forEach(function(file) {
      fileListHtml += '<li><a href="' + escapeHtml(file.url) + '" style="color: #004282;">' + escapeHtml(file.name) + '</a></li>';
    });
    fileListHtml += '</ul>';
  }

  var submitterDetailsHtml = safeData.submissionType === 'team'
    ? "<p style='margin: 5px 0;'><strong>Submission Type:</strong> Team</p>" +
      "<p style='margin: 5px 0;'><strong>Member 1:</strong> " + safeData.teamMember1 + " (" + safeData.teamMember1Gender + ")</p>" +
      "<p style='margin: 5px 0;'><strong>Member 2:</strong> " + safeData.teamMember2 + " (" + safeData.teamMember2Gender + ")</p>" +
      "<p style='margin: 5px 0;'><strong>Member 3:</strong> " + safeData.teamMember3 + " (" + safeData.teamMember3Gender + ")</p>"
    : "<p style='margin: 5px 0;'><strong>Submission Type:</strong> Individual</p>" +
      "<p style='margin: 5px 0;'><strong>Author Name:</strong> " + safeData.authorName + " (" + safeData.authorGender + ")</p>";

  var greetingName = safeData.submissionType === 'team' ? safeData.teamMember1 : safeData.authorName;
  
  var htmlMessage = "<div style='font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;'>" +
                "<h2 style='color: #004282; border-bottom: 3px solid #ee7d20; padding-bottom: 10px;'>Ministry Of Tourism</h2>" +
                "<p>Dear " + greetingName + ",</p>" +
                "<p style='color:green; font-weight:bold;'>✅ ការផ្ទុកឯកសារជោគជ័យ - Document Upload Successful!</p>" +
                "<p>Thank you for submitting your document(s) to our library. Your upload has been received and processed successfully.</p>" +
                "<div style='background: #f5f7fa; padding: 15px; border-radius: 8px; margin: 20px 0;'>" +
                "<h3 style='color: #004282; margin-top: 0;'>Upload Details:</h3>" +
                "<p style='margin: 5px 0;'><strong>Document Title:</strong> " + safeData.documentTitle + "</p>" +
                "<p style='margin: 5px 0;'><strong>Video URL:</strong> " + (safeData.videoUrl ? "<a href='" + safeData.videoUrl + "' style='color:#004282;'>" + safeData.videoUrl + "</a>" : 'N/A') + "</p>" +
                submitterDetailsHtml +
                "<p style='margin: 5px 0;'><strong>Email:</strong> " + safeData.email + "</p>" +
                "<p style='margin: 5px 0;'><strong>Phone:</strong> " + safeData.phone + "</p>" +
                "<p style='margin: 5px 0;'><strong>Uploaded File(s):</strong></p>" +
                fileListHtml +
                "</div>" +
                "<p>Your document(s) will be reviewed by our team and made available in the library shortly.</p>" +
                "<h3 style='color: #004282;'>Stay Connected:</h3>" +
                "<p style='line-height: 1.8;'>" +
                "🔹 <img src='https://cdn-icons-png.flaticon.com/512/2111/2111646.png' width='16' height='16' style='vertical-align: middle;'> " +
                "<a href='https://t.me/motresearchcompetiton' style='color: #004282; text-decoration: none;'>Telegram Channel</a><br>" +
                "🔹 <img src='https://cdn-icons-png.flaticon.com/512/733/733547.png' width='16' height='16' style='vertical-align: middle;'> " +
                "<a href='https://www.facebook.com/share/1Bh4GkZFYR/' style='color: #004282; text-decoration: none;'>Facebook Page</a><br>" +
                "🔹 <img src='https://cdn-icons-png.flaticon.com/512/724/724664.png' width='16' height='16' style='vertical-align: middle;'> " +
                "<a href='tel:095676763' style='color: #004282; text-decoration: none;'>095676763</a>" +
                "</p>" +
                "<p>If you have any questions, please don't hesitate to contact us.</p>" +
                "<hr style='border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;'>" +
                "<p style='color: #666; font-size: 0.9em;'>Best regards,<br>" +
                "<strong>Ministry Of Tourism</strong><br>" +
                "Research and Policy Department</p>" +
                "</div>";
  
  MailApp.sendEmail({
    to: data.email,
    subject: subject,
    htmlBody: htmlMessage
  });
}

// Handle GET requests (for testing)
function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({
      status: 'success',
      message: 'Upload API is working'
    }))
    .setMimeType(ContentService.MimeType.JSON);
}
