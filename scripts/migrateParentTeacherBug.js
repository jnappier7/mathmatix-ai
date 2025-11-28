// scripts/migrateParentTeacherBug.js
// Migration script to fix parent-teacher data corruption bug
// This fixes students who have parents in their teacherId field

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/user');

async function migrateParentTeacherData() {
    try {
        console.log('🔧 Starting parent-teacher data migration...\n');

        // Connect to MongoDB
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Connected to MongoDB\n');

        // Find all students
        const students = await User.find({ role: 'student' }).populate('teacherId');
        console.log(`📊 Found ${students.length} students to check\n`);

        let fixedCount = 0;
        let skippedCount = 0;

        for (const student of students) {
            // Check if teacherId points to a parent (not a teacher)
            if (student.teacherId && student.teacherId.role === 'parent') {
                console.log(`🔍 Found corrupted data for student: ${student.username} (${student.firstName} ${student.lastName})`);
                console.log(`   teacherId currently points to parent: ${student.teacherId.username}`);

                const parentId = student.teacherId._id;
                const parent = await User.findById(parentId);

                if (parent) {
                    // Initialize parentIds array if it doesn't exist
                    student.parentIds = student.parentIds || [];

                    // Add parent to parentIds if not already there
                    if (!student.parentIds.some(id => id.equals(parentId))) {
                        student.parentIds.push(parentId);
                        console.log(`   ✓ Added parent to parentIds array`);
                    }

                    // Ensure parent has student in children array
                    parent.children = parent.children || [];
                    if (!parent.children.some(id => id.equals(student._id))) {
                        parent.children.push(student._id);
                        console.log(`   ✓ Added student to parent's children array`);
                        await parent.save();
                    }

                    // Clear the teacherId field (parent should not be teacher)
                    student.teacherId = null;
                    console.log(`   ✓ Cleared teacherId field`);

                    await student.save();
                    fixedCount++;
                    console.log(`   ✅ Fixed student ${student.username}\n`);
                } else {
                    console.log(`   ⚠️  Parent not found, skipping\n`);
                    skippedCount++;
                }
            } else if (student.teacherId && student.teacherId.role === 'teacher') {
                // This is correct - student has a real teacher
                // Skip silently
                skippedCount++;
            } else if (!student.teacherId) {
                // Student has no teacher assigned - this is OK
                skippedCount++;
            }
        }

        console.log('\n📊 Migration Summary:');
        console.log(`   Total students checked: ${students.length}`);
        console.log(`   Fixed (corrupted data): ${fixedCount}`);
        console.log(`   Skipped (already correct): ${skippedCount}`);
        console.log('\n✅ Migration completed successfully!');

    } catch (error) {
        console.error('\n❌ Migration failed:', error);
        process.exit(1);
    } finally {
        await mongoose.connection.close();
        console.log('\n🔌 Disconnected from MongoDB');
        process.exit(0);
    }
}

// Run the migration
migrateParentTeacherData();
