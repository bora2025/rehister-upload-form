// Google Apps Script - Deploy as Web App
// This script receives form data and saves it to Google Sheets and sends confirmation email

function doPost(e) {
  try {
    // Parse the incoming data
    const data = JSON.parse(e.postData.contents);
    
    // Log received data
    Logger.log('Received data: ' + JSON.stringify(data));
    
    // Replace with your Google Sheet ID
    const SHEET_ID = '1ySDbBD7NsV5qQfLCQGwGE_6pj6Gh73sCYMD9tRvdEyA';
    const sheet = SpreadsheetApp.openById(SHEET_ID).getActiveSheet();
    
    // Add headers if first row is empty
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(['Timestamp', 'Type', 'Name', 'Gender', 'Organization', 'Phone', 'Email']);
    }
    
    // Append the form data
    sheet.appendRow([
      new Date(),
      data.type || '',
      data.name || '',
      data.gender || '',
      data.organization || '',
      data.phone || '',
      data.email || ''
    ]);
    
    Logger.log('Data saved to sheet');
    
    // Send confirmation email automatically
    if (data.email && data.email.trim() !== '') {
      try {
        sendConfirmationEmail(data);
        Logger.log('Confirmation email sent to: ' + data.email);
      } catch (emailError) {
        Logger.log('Error sending email: ' + emailError.toString());
      }
    }
    
    // Return success response
    return ContentService
      .createTextOutput(JSON.stringify({
        status: 'success',
        message: 'Form submitted successfully'
      }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    // Return error response
    Logger.log('Error in doPost: ' + error.toString());
    return ContentService
      .createTextOutput(JSON.stringify({
        status: 'error',
        message: error.toString()
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Function to send confirmation email
function sendConfirmationEmail(data) {
  var subject = "ការចុះឈ្មោះជោគជ័យ - Registration Successful";
  
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
                "<p>More Information:<br>" +
                "🔹 <img src='https://cdn-icons-png.flaticon.com/512/2111/2111646.png' width='12' height='12'> " +
                "<a href='https://t.me/motresearchcompetiton'>Telegram Channel</a><br>" +
                "🔹 <img src='https://cdn-icons-png.flaticon.com/512/733/733547.png' width='12' height='12'> " +
                "<a href='https://www.facebook.com/share/1Bh4GkZFYR/'>Facebook Page</a><br>" +
                "🔹 <img src='https://cdn-icons-png.flaticon.com/512/724/724664.png' width='12' height='12'> " +
                "<a href='tel:095676763'>095676763</a></p>" +
                "<p>We appreciate your interest in the Competition Research and will respond within 24-48 hours.</p>" +
                "<p>Regards,<br>Ministry Of Tourism<br>Admin Team</p>";
  
  MailApp.sendEmail({
    to: data.email,
    subject: subject,
    htmlBody: htmlMessage
  });
}

// Handle GET requests (optional - for testing)
function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({
      status: 'success',
      message: 'API is working'
    }))
    .setMimeType(ContentService.MimeType.JSON);
}
