const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../../uploads');
const videosDir = path.join(uploadsDir, 'videos');
const logosDir = path.join(uploadsDir, 'logos');

const prospectsDir = path.join(uploadsDir, 'prospects');

// Try to create directories, but don't fail if they already exist or can't be created
try {
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  if (!fs.existsSync(videosDir)) {
    fs.mkdirSync(videosDir, { recursive: true });
  }
  if (!fs.existsSync(logosDir)) {
    fs.mkdirSync(logosDir, { recursive: true });
  }
  if (!fs.existsSync(prospectsDir)) {
    fs.mkdirSync(prospectsDir, { recursive: true });
  }
} catch (error) {
  console.warn('Upload directories may already exist or will be created by Docker:', error.message);
}

// Configure storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, videosDir);
  },
  filename: (req, file, cb) => {
    // Create unique filename: playerId-timestamp-originalname
    const playerId = req.params.id || 'new';
    const timestamp = Date.now();
    const originalName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, ''); // Sanitize filename
    cb(null, `${playerId}-${timestamp}-${originalName}`);
  }
});

// File filter for videos only
const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    'video/mp4',
    'video/quicktime',
    'video/x-msvideo', // .avi
    'video/webm',
    'video/ogg'
  ];

  const allowedExtensions = ['.mp4', '.mov', '.avi', '.webm', '.ogv'];
  const fileExtension = path.extname(file.originalname).toLowerCase();

  if (allowedMimeTypes.includes(file.mimetype) || allowedExtensions.includes(fileExtension)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only video files are allowed.'), false);
  }
};

// Configure multer for videos
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB limit
  }
});

// Middleware for handling video uploads
const uploadVideo = upload.single('video');

// Configure storage for logos
const logoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, logosDir);
  },
  filename: (req, file, cb) => {
    const teamId = req.user?.team_id || 'unknown';
    const timestamp = Date.now();
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `team-${teamId}-${timestamp}${ext}`);
  }
});

// File filter for images (logos)
const imageFileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/svg+xml',
    'image/webp'
  ];

  const allowedExtensions = ['.png', '.jpg', '.jpeg', '.svg', '.webp'];
  const fileExtension = path.extname(file.originalname).toLowerCase();

  if (allowedMimeTypes.includes(file.mimetype) || allowedExtensions.includes(fileExtension)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only PNG, JPG, SVG, and WebP images are allowed.'), false);
  }
};

// Configure multer for logos
const logoUpload = multer({
  storage: logoStorage,
  fileFilter: imageFileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit for logos
  }
});

// Middleware for handling logo uploads
const uploadLogo = logoUpload.single('logo');

// Configure storage for prospect media
const prospectMediaStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, prospectsDir);
  },
  filename: (req, file, cb) => {
    const prospectId = req.params.id || 'unknown';
    const timestamp = Date.now();
    const originalName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '');
    cb(null, `prospect-${prospectId}-${timestamp}-${originalName}`);
  }
});

// File filter for prospect media (videos, photos, documents)
const prospectMediaFileFilter = (_req, file, cb) => {
  const allowedMimeTypes = [
    'video/mp4',
    'video/quicktime',
    'video/webm',
    'image/png',
    'image/jpeg',
    'image/webp',
    'application/pdf'
  ];

  const allowedExtensions = ['.mp4', '.mov', '.webm', '.png', '.jpg', '.jpeg', '.webp', '.pdf'];
  const fileExtension = path.extname(file.originalname).toLowerCase();

  if (allowedMimeTypes.includes(file.mimetype) || allowedExtensions.includes(fileExtension)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only video, image, and PDF files are allowed.'), false);
  }
};

// Configure multer for prospect media
const prospectMediaUpload = multer({
  storage: prospectMediaStorage,
  fileFilter: prospectMediaFileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB limit
  }
});

// Middleware for handling prospect media uploads
const uploadProspectMedia = prospectMediaUpload.single('file');

// Error handling middleware
const handleUploadError = (error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: 'File too large. Maximum size exceeded.'
      });
    }
    return res.status(400).json({
      success: false,
      error: `Upload error: ${error.message}`
    });
  }

  if (error.message.includes('Invalid file type')) {
    return res.status(400).json({
      success: false,
      error: error.message
    });
  }

  next(error);
};

module.exports = {
  uploadVideo,
  uploadLogo,
  uploadProspectMedia,
  handleUploadError,
  logosDir,
  prospectsDir
};
