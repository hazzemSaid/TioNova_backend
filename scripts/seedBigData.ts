import dotenv from 'dotenv';
import mongoose from 'mongoose';
import ChallengeResult from '../src/models/ChallengeResultModel';
import Chapter from '../src/models/ChapterModel';
import Folder from '../src/models/FolderModel';
import Mindmap from '../src/models/MindmapModel';
import Node from '../src/models/NodeModel';
import Note from '../src/models/NoteModel';
import Question from '../src/models/QuestionModel';
import Quiz from '../src/models/QuizModel';
import Summary from '../src/models/SummaryModel';
import User from '../src/models/UserModel';
import UserQuizStatus from '../src/models/UserQuizStatusModel';
dotenv.config();

async function seedBigData(count = 1000) {
  const mongoUrl = process.env.MONGO_URI || 'mongodb://localhost:27017/tioNova_test';
  await mongoose.connect(mongoUrl);
  console.log(`Connected to ${mongoUrl}`);
  await mongoose.connection.dropDatabase();
  console.log('Database dropped.');

  for (let i = 0; i < count; i++) {
    let user, folder, chapter, mindmap, node, note, quiz, question, summary;
    try {
      user = await User.create({ username: `user${i}`, email: `user${i}@test.com`, password: 'pass1234' });
      folder = await Folder.create({
        ownerId: user._id,
        title: `Folder ${i}`,
        description: 'Test folder',
        icon: '📁',
        color: '#3B82F6',
        category: 'General',
        status: Math.random() < 0.2 ? 'public' : 'private',
      });
      chapter = await Chapter.create({
        folderId: folder._id,
        title: `Chapter ${i}`,
        description: 'Test chapter',
        content: Buffer.from('PDF binary data'),
        createdBy: user._id,
        updatedBy: user._id,
        contentType: 'application/pdf',
      });
      mindmap = await Mindmap.create({
        chapterId: chapter._id,
        title: `Mindmap ${i}`,
        createdBy: user._id,
      });
      node = await Node.create({
        title: `Node ${i}`,
        content: 'Node content',
        isRoot: true,
      });
      mindmap.nodes = [node._id];
      await mindmap.save();
      note = await Note.create({
        title: `Note ${i}`,
        chapterId: chapter._id,
        createdBy: user._id,
        rawData: { type: 'text', data: 'Test note' },
      });
      quiz = await Quiz.create({
        chapterId: chapter._id,
        title: `Quiz ${i}`,
        questions: [],
        createdBy: user._id,
        updatedBy: user._id,
      });
      question = await Question.create({
        quizId: quiz._id,
        question: 'What is 2+2?',
        options: ['2', '3', '4', '5'],
        answer: '4',
      });
      quiz.questions = [question._id];
      await quiz.save();
      summary = await Summary.create({
        chapterId: chapter._id,
        summary: { text: 'Summary content' },
      });
      await ChallengeResult.create({
        challengeCode: `CHALL${i}`,
        owner: user._id,
        quizId: quiz._id,
        chapterId: chapter._id,
        status: 'completed',
        participants: [{
          userId: user._id,
          username: user.username,
          score: 10,
          answers: [{
            questionId: question._id,
            selectedOption: '4',
            isCorrect: true,
            answeredAt: new Date(),
          }],
        }],
        questions: [{
          questionId: question._id,
          question: 'What is 2+2?',
          options: ['2', '3', '4', '5'],
          answer: '4',
        }],
        finalRankings: [{
          userId: user._id,
          score: 10,
          rank: 1,
        }],
        createdAt: new Date(),
        startedAt: new Date(),
      });
      await UserQuizStatus.create({
        userId: user._id,
        quizId: quiz._id,
        chapterId: chapter._id,
        status: 'Passed',
        score: 10,
        attempts: [{
          timeTaken: 30,
          startedAt: new Date(),
          completedAt: new Date(),
        }],
      });
    } catch (err) {
      console.error(`Seeding error at record ${i}:`, err);
      continue;
    }
    if ((i + 1) % 100 === 0) console.log(`${i + 1} records inserted`);
  }
  await mongoose.connection.close();
  console.log('Seeding complete!');
}

seedBigData().catch(console.error);
