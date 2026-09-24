const { google } = require('googleapis');
const { Readable } = require('stream');

let driveClient = null;
let initializedFolders = {};

const fs = require('fs');
const path = require('path');

/**
 * Initialize Google Drive API Client using Service Account Credentials
 */
const getDriveClient = () => {
  if (driveClient) return driveClient;

  // 1. Check for service-account.json file in backend root or config folder
  const possibleJsonPaths = [
    path.join(__dirname, '../../service-account.json'),
    path.join(__dirname, '../../google-service-account.json'),
    path.join(__dirname, '../config/service-account.json'),
  ];

  for (const jsonPath of possibleJsonPaths) {
    if (fs.existsSync(jsonPath)) {
      try {
        const rawContent = fs.readFileSync(jsonPath, 'utf8');
        const keyData = JSON.parse(rawContent);
        if (keyData.private_key) {
          keyData.private_key = keyData.private_key.replace(/\\n/g, '\n');
        }

        const auth = new google.auth.GoogleAuth({
          credentials: keyData,
          scopes: ['https://www.googleapis.com/auth/drive'],
        });
        driveClient = google.drive({ version: 'v3', auth });
        console.log(`[GoogleDriveService] Authenticated using keyFile: ${path.basename(jsonPath)}`);
        return driveClient;
      } catch (err) {
        console.error(`[GoogleDriveService] Error loading keyFile ${jsonPath}:`, err.message);
      }
    }
  }

  // 2. Fallback to Environment Variables (GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY)
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  let privateKey = process.env.GOOGLE_PRIVATE_KEY;

  if (!clientEmail || !privateKey) {
    console.warn('[GoogleDriveService] Warning: GOOGLE_CLIENT_EMAIL or GOOGLE_PRIVATE_KEY missing in environment.');
    return null;
  }

  try {
    let cleanKey = privateKey.trim();
    cleanKey = cleanKey.replace(/\r/g, '');
    cleanKey = cleanKey.replace(/^["'\s]+|["'\s]+$/g, '');
    cleanKey = cleanKey.replace(/\\n/g, '\n');

    const auth = new google.auth.JWT(
      clientEmail,
      null,
      cleanKey,
      ['https://www.googleapis.com/auth/drive']
    );

    driveClient = google.drive({ version: 'v3', auth });
    return driveClient;
  } catch (error) {
    console.error('[GoogleDriveService] Failed to initialize Google Drive JWT Client:', error.message);
    return null;
  }
};

/**
 * Create or reuse a folder in Google Drive
 */
const createDriveFolderIfNeeded = async (folderName, parentFolderId = null) => {
  const drive = getDriveClient();
  if (!drive) return null;

  try {
    let query = `name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    if (parentFolderId) {
      query += ` and '${parentFolderId}' in parents`;
    }

    const res = await drive.files.list({
      q: query,
      fields: 'files(id, name)',
      spaces: 'drive',
    });

    if (res.data.files && res.data.files.length > 0) {
      return res.data.files[0].id;
    }

    // Folder does not exist; create it
    const fileMetadata = {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
    };
    if (parentFolderId) {
      fileMetadata.parents = [parentFolderId];
    }

    const folder = await drive.files.create({
      requestBody: fileMetadata,
      fields: 'id, name',
    });

    return folder.data.id;
  } catch (error) {
    console.error(`[GoogleDriveService] Error resolving/creating folder "${folderName}":`, error.message);
    return null;
  }
};

/**
 * Ensure full Altera Interior CRM folder hierarchy exists
 */
const initializeFolderStructure = async () => {
  const drive = getDriveClient();
  if (!drive) {
    console.warn('[GoogleDriveService] Skipping folder initialization due to missing Drive credentials.');
    return initializedFolders;
  }

  try {
    // 1. Root folder
    let rootFolderId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
    if (!rootFolderId) {
      rootFolderId = await createDriveFolderIfNeeded('Altera Interior CRM');
      if (rootFolderId) process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID = rootFolderId;
    }
    initializedFolders.root = rootFolderId;

    // 2. Subfolders
    const folderSpecs = [
      { key: 'Tasks', envKey: 'GOOGLE_DRIVE_TASKS_FOLDER_ID', name: 'Tasks' },
      { key: 'Attendance', envKey: 'GOOGLE_DRIVE_ATTENDANCE_FOLDER_ID', name: 'Attendance' },
      { key: 'Quotations', envKey: 'GOOGLE_DRIVE_QUOTATIONS_FOLDER_ID', name: 'Quotations' },
      { key: 'Offer Letters', envKey: 'GOOGLE_DRIVE_OFFER_LETTERS_FOLDER_ID', name: 'Offer Letters' },
      { key: 'CRM Files', envKey: 'GOOGLE_DRIVE_CRM_FOLDER_ID', name: 'CRM Files' },
      { key: 'Employee Documents', envKey: 'GOOGLE_DRIVE_EMPLOYEE_DOCUMENTS_FOLDER_ID', name: 'Employee Documents' },
    ];

    for (const spec of folderSpecs) {
      let subFolderId = process.env[spec.envKey];
      if (!subFolderId && rootFolderId) {
        subFolderId = await createDriveFolderIfNeeded(spec.name, rootFolderId);
        if (subFolderId) process.env[spec.envKey] = subFolderId;
      }
      initializedFolders[spec.key] = subFolderId;
    }

    console.log('[GoogleDriveService] Folder structure initialized successfully:', initializedFolders);
    return initializedFolders;
  } catch (error) {
    console.error('[GoogleDriveService] Error initializing folder structure:', error.message);
    return initializedFolders;
  }
};

/**
 * Get folder ID by folderType string e.g. "Tasks", "Attendance"
 */
const getFolderId = (folderType) => {
  const envMap = {
    Tasks: process.env.GOOGLE_DRIVE_TASKS_FOLDER_ID,
    Attendance: process.env.GOOGLE_DRIVE_ATTENDANCE_FOLDER_ID,
    Quotations: process.env.GOOGLE_DRIVE_QUOTATIONS_FOLDER_ID,
    'Offer Letters': process.env.GOOGLE_DRIVE_OFFER_LETTERS_FOLDER_ID,
    OfferLetters: process.env.GOOGLE_DRIVE_OFFER_LETTERS_FOLDER_ID,
    'CRM Files': process.env.GOOGLE_DRIVE_CRM_FOLDER_ID,
    CRM: process.env.GOOGLE_DRIVE_CRM_FOLDER_ID,
    'Employee Documents': process.env.GOOGLE_DRIVE_EMPLOYEE_DOCUMENTS_FOLDER_ID,
    EmployeeDocuments: process.env.GOOGLE_DRIVE_EMPLOYEE_DOCUMENTS_FOLDER_ID,
  };

  return envMap[folderType] || initializedFolders[folderType] || process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
};

/**
 * Upload file buffer or stream to Google Drive
 */
const uploadFileToDrive = async ({ buffer, fileName, mimeType, folderType, folderId }) => {
  const drive = getDriveClient();
  if (!drive) {
    throw new Error('Google Drive service is not configured or authenticated.');
  }

  const targetFolderId = folderId || getFolderId(folderType);
  if (!targetFolderId) {
    console.warn(`[GoogleDriveService] No folder ID resolved for type "${folderType}". Uploading to Drive root.`);
  }

  const fileMetadata = {
    name: fileName,
  };
  if (targetFolderId) {
    fileMetadata.parents = [targetFolderId];
  }

  const media = {
    mimeType: mimeType || 'application/octet-stream',
    body: Readable.from(buffer),
  };

  const response = await drive.files.create({
    requestBody: fileMetadata,
    media: media,
    fields: 'id, name, webViewLink, webContentLink, mimeType, size',
  });

  const data = response.data;
  return {
    driveFileId: data.id,
    driveUrl: data.webViewLink || data.webContentLink || `https://drive.google.com/file/d/${data.id}/view`,
    fileName: data.name,
    mimeType: data.mimeType || mimeType,
    fileSize: data.size ? Number(data.size) : buffer.length,
    folderType: folderType || 'General',
  };
};

/**
 * Delete a file from Google Drive safely
 */
const deleteFileFromDrive = async (driveFileId) => {
  if (!driveFileId) return false;
  const drive = getDriveClient();
  if (!drive) return false;

  try {
    await drive.files.delete({ fileId: driveFileId });
    return true;
  } catch (error) {
    // 404 means already deleted; log and swallow safely
    if (error.code === 404 || error.status === 404) {
      console.warn(`[GoogleDriveService] File ${driveFileId} was not found on Drive (already deleted).`);
      return true;
    }
    console.error(`[GoogleDriveService] Failed to delete file ${driveFileId}:`, error.message);
    return false;
  }
};

/**
 * Get File metadata
 */
const getDriveFileMetadata = async (driveFileId) => {
  const drive = getDriveClient();
  if (!drive) throw new Error('Google Drive service not configured.');

  const res = await drive.files.get({
    fileId: driveFileId,
    fields: 'id, name, mimeType, size, webViewLink, webContentLink',
  });

  return res.data;
};

/**
 * Pipe Google Drive file stream into an express response object
 */
const streamDriveFile = async (driveFileId, res) => {
  const drive = getDriveClient();
  if (!drive) {
    return res.status(500).json({ success: false, message: 'Google Drive service unavailable' });
  }

  try {
    const meta = await getDriveFileMetadata(driveFileId);
    if (meta.mimeType) {
      res.setHeader('Content-Type', meta.mimeType);
    }
    if (meta.name) {
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(meta.name)}"`);
    }

    const driveStream = await drive.files.get(
      { fileId: driveFileId, alt: 'media' },
      { responseType: 'stream' }
    );

    driveStream.data
      .on('error', (err) => {
        console.error('[GoogleDriveService] Stream error:', err.message);
        if (!res.headersSent) {
          res.status(500).json({ success: false, message: 'Error streaming file content' });
        }
      })
      .pipe(res);
  } catch (error) {
    console.error(`[GoogleDriveService] Error fetching file ${driveFileId}:`, error.message);
    if (!res.headersSent) {
      if (error.code === 404 || error.status === 404) {
        return res.status(404).json({ success: false, message: 'File not found on Google Drive' });
      }
      return res.status(500).json({ success: false, message: 'Failed to access Google Drive file' });
    }
  }
};

module.exports = {
  getDriveClient,
  createDriveFolderIfNeeded,
  initializeFolderStructure,
  uploadFileToDrive,
  deleteFileFromDrive,
  getDriveFileMetadata,
  streamDriveFile,
};
