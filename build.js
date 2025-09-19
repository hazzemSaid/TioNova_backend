const fs = require('fs-extra');
const path = require('path');

async function build() {
  try {
    console.log('📦 Starting build process...');
    
    // Ensure dist directory exists
    await fs.ensureDir('./dist');
    
    // Copy static files (if exists)
    console.log('📁 Copying static files...');
    if (await fs.pathExists('./src/static')) {
      await fs.copy('./src/static', './dist/static');
    } else {
      console.log('⚠️ Static files not found, skipping...');
    }
    
    // Copy openapi.yaml (if exists)
    console.log('📄 Copying OpenAPI spec...');
    if (await fs.pathExists('./openapi.yaml')) {
      await fs.copy('./openapi.yaml', './dist/openapi.yaml');
    } else {
      console.log('⚠️ OpenAPI spec not found, skipping...');
    }
    
    // Copy eng.traineddata (if exists)
    console.log('🔤 Copying Tesseract data...');
    if (await fs.pathExists('./eng.traineddata')) {
      await fs.copy('./eng.traineddata', './dist/eng.traineddata');
    } else {
      console.log('⚠️ Tesseract data not found, skipping...');
    }
    
    // Note: Python service removed for Vercel deployment
    
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