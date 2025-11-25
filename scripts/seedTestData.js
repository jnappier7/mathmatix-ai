// scripts/seedTestData.js
// Seeds database with test teacher, students, and active conversations
// Run with: node scripts/seedTestData.js

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/user');
const Conversation = require('../models/conversation');

const TEACHER_EMAIL = 'teacher@test.com';
const STUDENT_COUNT = 5;
const PASSWORD = 'password'; // Weak password OK for test data

async function seedTestData() {
    try {
        console.log('🌱 Seeding test data...\n');

        // Connect to MongoDB
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Connected to MongoDB');

        // Clear existing test data
        await User.deleteMany({ username: { $regex: /^(teacher|student\d+)$/ } });
        console.log('🧹 Cleared old test data');

        // Create teacher
        const teacher = new User({
            username: 'teacher',
            email: TEACHER_EMAIL,
            password: PASSWORD, // Will be hashed by pre-save hook
            role: 'teacher',
            firstName: 'Ms.',
            lastName: 'Thompson',
            gradeLevel: null,
            xp: 0,
            level: 1
        });
        await teacher.save();
        console.log(`👩‍🏫 Created teacher: ${TEACHER_EMAIL} / ${PASSWORD}`);

        // Create students
        const students = [];
        const studentNames = [
            { firstName: 'Emma', lastName: 'Johnson' },
            { firstName: 'Liam', lastName: 'Garcia' },
            { firstName: 'Sophia', lastName: 'Martinez' },
            { firstName: 'Noah', lastName: 'Davis' },
            { firstName: 'Olivia', lastName: 'Rodriguez' }
        ];

        for (let i = 0; i < STUDENT_COUNT; i++) {
            const student = new User({
                username: `student${i + 1}`,
                email: `student${i + 1}@test.com`,
                password: PASSWORD,
                role: 'student',
                firstName: studentNames[i].firstName,
                lastName: studentNames[i].lastName,
                gradeLevel: 6 + (i % 3), // Grades 6-8
                teacherId: teacher._id,
                xp: Math.floor(Math.random() * 1000),
                level: 1 + Math.floor(Math.random() * 5),
                selectedTutorId: 'default'
            });
            await student.save();
            students.push(student);
            console.log(`👨‍🎓 Created student: student${i + 1}@test.com / ${PASSWORD}`);
        }

        console.log('\n📝 Creating sample conversations...');

        // Create active conversations for testing live feed
        const conversationScenarios = [
            {
                // Student 1: Struggling with fractions
                studentIndex: 0,
                messages: [
                    { role: 'user', content: 'Can you help me with fractions?' },
                    { role: 'assistant', content: 'Of course! What would you like to know about fractions?' },
                    { role: 'user', content: 'I don\'t understand how to add them' },
                    { role: 'assistant', content: 'Let me explain. To add fractions, you need a common denominator. Let\'s try an example: 1/2 + 1/4' },
                    { role: 'user', content: 'I\'m confused about the denominator' },
                    { role: 'assistant', content: 'The denominator is the bottom number. Let me break this down step by step...' }
                ],
                topic: 'fractions',
                isStruggling: true,
                strugglingWith: 'denominator'
            },
            {
                // Student 2: Working on linear equations
                studentIndex: 1,
                messages: [
                    { role: 'user', content: 'How do I solve 2x + 5 = 13?' },
                    { role: 'assistant', content: 'Great question! Let\'s isolate x. First, subtract 5 from both sides.' },
                    { role: 'user', content: 'So 2x = 8?' },
                    { role: 'assistant', content: 'Exactly! Now divide both sides by 2. What do you get?' },
                    { role: 'user', content: 'x = 4!' },
                    { role: 'assistant', content: 'Perfect! You got it. That\'s correct!' }
                ],
                topic: 'linear equation',
                isStruggling: false,
                strugglingWith: null
            },
            {
                // Student 3: Just started
                studentIndex: 2,
                messages: [
                    { role: 'user', content: 'Hi!' },
                    { role: 'assistant', content: 'Hello! I\'m Mathmatix, your AI tutor. What would you like to work on today?' }
                ],
                topic: 'mathematics',
                isStruggling: false,
                strugglingWith: null
            }
        ];

        for (const scenario of conversationScenarios) {
            const student = students[scenario.studentIndex];

            const conversation = new Conversation({
                userId: student._id,
                messages: scenario.messages,
                isActive: true,
                startDate: new Date(Date.now() - Math.random() * 20 * 60 * 1000), // Started 0-20 min ago
                lastActivity: new Date(),
                activeMinutes: Math.floor(Math.random() * 15) + 5,
                currentTopic: scenario.topic,
                problemsAttempted: Math.floor(Math.random() * 5),
                problemsCorrect: Math.floor(Math.random() * 3),
                strugglingWith: scenario.strugglingWith,
                liveSummary: `${student.firstName} is working on ${scenario.topic}`,
                lastSummaryUpdate: new Date()
            });

            // Add struggle alert if needed
            if (scenario.isStruggling) {
                conversation.alerts = [{
                    type: 'struggle',
                    message: `Struggling with ${scenario.strugglingWith}`,
                    timestamp: new Date(),
                    acknowledged: false,
                    severity: 'medium'
                }];
            }

            await conversation.save();

            // Update student with active conversation
            student.activeConversationId = conversation._id;
            await student.save();

            const status = scenario.isStruggling ? '⚠️  STRUGGLING' : '✅ Active';
            console.log(`  ${status} - ${student.firstName}: ${scenario.topic}`);
        }

        console.log('\n✨ Test data seeded successfully!\n');
        console.log('📋 Login Credentials:');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`👩‍🏫 Teacher: ${TEACHER_EMAIL} / ${PASSWORD}`);
        console.log(`👨‍🎓 Students: student1@test.com through student${STUDENT_COUNT}@test.com / ${PASSWORD}`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        console.log('🧪 Test Scenarios Created:');
        console.log('  • Student 1 (Emma): Struggling with fractions - should show alert');
        console.log('  • Student 2 (Liam): Working on linear equations - progressing well');
        console.log('  • Student 3 (Sophia): Just started session - minimal activity');
        console.log('  • Students 4-5: No active sessions\n');
        console.log('🚀 Ready to test! Start server with: npm run dev');
        console.log('   → Login as teacher to see live feed');
        console.log('   → Login as student to test whiteboard\n');

        process.exit(0);
    } catch (error) {
        console.error('❌ Error seeding data:', error);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    seedTestData();
}

module.exports = seedTestData;
