// Google Apps Script for Upload Document Form
// Deploy as Web App with permissions to access Drive and send emails

function doPost(e) {
  try {
    Logger.log('=== Upload Request Started ===');
    
    // Debug: Write raw request to sheet
    var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
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
    
    var authorName = jsonData.authorName || '';
    var email = jsonData.email || '';
    var phone = jsonData.phone || '';
    var documentTitle = jsonData.documentTitle || '';
    var filesData = jsonData.files || [];
    
    Logger.log('Author Name: ' + authorName);
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
            
            // Decode base64 and create blob
            var decoded = Utilities.base64Decode(fileData.data);
            var blob = Utilities.newBlob(decoded);
            blob.setName(fileData.name);
            
            // Set content type if available
            if (fileData.mimeType) {
              blob.setContentType(fileData.mimeType);
            }
            
            // Create file in Drive
            var file = folder.createFile(blob);
            file.setDescription('Uploaded by: ' + authorName + ' | Email: ' + email + ' | Phone: ' + phone + ' | Title: ' + documentTitle);
            
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
      // Use the active spreadsheet instead of openById to avoid permission issues
      var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
      
      // If you need to use a specific spreadsheet, you must bind this script to that spreadsheet
      // Go to the spreadsheet -> Extensions -> Apps Script, and paste this code there
      
      Logger.log('Spreadsheet opened successfully');
      
      // Create or get "Uploads" sheet
      var uploadsSheet = spreadsheet.getSheetByName('Uploads');
      if (!uploadsSheet) {
        uploadsSheet = spreadsheet.insertSheet('Uploads');
        uploadsSheet.appendRow(['Timestamp', 'Author Name', 'Email', 'Phone', 'Document Title', 'Files', 'File URLs']);
      }
      
      // Prepare file info for sheet
      var fileNames = files.length > 0 ? files.map(function(f) { return f.name; }).join(', ') : 'No files uploaded';
      var fileUrls = files.length > 0 ? files.map(function(f) { return f.url; }).join(', ') : '';
      
      // Add to sheet
      uploadsSheet.appendRow([
        new Date(),
        authorName,
        email,
        phone,
        documentTitle,
        fileNames,
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
          authorName: authorName,
          email: email,
          phone: phone,
          documentTitle: documentTitle,
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
  var fileListHtml = '';
  if (data.files && data.files.length > 0) {
    fileListHtml = '<ul style="margin: 10px 0; padding-left: 20px;">';
    data.files.forEach(function(file) {
      fileListHtml += '<li><a href="' + file.url + '" style="color: #004282;">' + file.name + '</a></li>';
    });
    fileListHtml += '</ul>';
  }
  
  var htmlMessage = "<div style='font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;'>" +
                "<h2 style='color: #004282; border-bottom: 3px solid #ee7d20; padding-bottom: 10px;'>Ministry Of Tourism</h2>" +
                "<p>Dear " + data.authorName + ",</p>" +
                "<p style='color:green; font-weight:bold;'>✅ ការផ្ទុកឯកសារជោគជ័យ - Document Upload Successful!</p>" +
                "<p>Thank you for submitting your document(s) to our library. Your upload has been received and processed successfully.</p>" +
                "<div style='background: #f5f7fa; padding: 15px; border-radius: 8px; margin: 20px 0;'>" +
                "<h3 style='color: #004282; margin-top: 0;'>Upload Details:</h3>" +
                "<p style='margin: 5px 0;'><strong>Document Title:</strong> " + data.documentTitle + "</p>" +
                "<p style='margin: 5px 0;'><strong>Author Name:</strong> " + data.authorName + "</p>" +
                "<p style='margin: 5px 0;'><strong>Email:</strong> " + data.email + "</p>" +
                "<p style='margin: 5px 0;'><strong>Phone:</strong> " + data.phone + "</p>" +
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
