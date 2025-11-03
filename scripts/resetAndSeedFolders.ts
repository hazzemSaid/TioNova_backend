import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Folder from '../src/models/FolderModel';
dotenv.config();

const ICONS = Array.from({ length: 10 }, (_, i) => i); // 0-9
const COLORS = Array.from({ length: 5 }, (_, i) => i); // 0-4

async function resetAndSeedFolders(count = 100) {
  const mongoUrl = process.env.MONGO_URI || 'mongodb://localhost:27017/tioNova_test';
  await mongoose.connect(mongoUrl);
  console.log(`Connected to ${mongoUrl}`);

  // Remove all folders
  await Folder.deleteMany({});
  console.log('All folders removed.');

  // Insert new folders
  for (let i = 0; i < count; i++) {
    const folder = await Folder.create({
      ownerId: new mongoose.Types.ObjectId(), // Dummy owner, replace as needed
      title: `Folder ${i}`,
      description: 'Test folder',
      icon: ICONS[i % ICONS.length],
      color: COLORS[i % COLORS.length],
      category: 'General',
      status: Math.random() < 0.2 ? 'public' : 'private',
      sharedWith: [],
    });
    if ((i + 1) % 20 === 0) console.log(`${i + 1} folders created`);
  }

  await mongoose.connection.close();
  console.log('Folder seeding complete!');
}

resetAndSeedFolders().catch(console.error);
