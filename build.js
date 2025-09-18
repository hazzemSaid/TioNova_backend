const fs = require('fs-extra');
const path = require('path');

async function build() {
  try {
    console.log('📦 Starting build process...');
    
    // Ensure dist directory exists
    await fs.ensureDir('./dist');
    
    // Copy static files
    console.log('📁 Copying static files...');
    await fs.copy('./static', './dist/static');
    
    // Copy openapi.yaml
    console.log('📄 Copying OpenAPI spec...');
    await fs.copy('./openapi.yaml', './dist/openapi.yaml');
    
    // Copy eng.traineddata (Tesseract data)
    console.log('🔤 Copying Tesseract data...');
    await fs.copy('./eng.traineddata', './dist/eng.traineddata');
    
    // Copy Python service
    console.log('🐍 Copying Python service...');
    await fs.ensureDir('./dist/src/services');
    await fs.copy('./src/services/pdf_service.py', './dist/src/services/pdf_service.py');
    
    // Copy requirements.txt
    console.log('📋 Copying Python requirements...');
    await fs.copy('./requirements.txt', './dist/requirements.txt');
    
    // Create uploads directory
    console.log('📂 Creating uploads directory...');
    await fs.ensureDir('./dist/uploads');
    
    console.log('✅ Build completed successfully!');
  } catch (error) {
    console.error('❌ Build failed:', error);
    process.exit(1);
  }
}

build();