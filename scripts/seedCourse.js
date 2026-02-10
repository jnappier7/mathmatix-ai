#!/usr/bin/env node
// scripts/seedCourse.js
// Seeds the Algebra 1 course definition into MongoDB
//
// Usage: node scripts/seedCourse.js [--force]
//   --force: Overwrite existing course if it already exists

require('dotenv').config();
const mongoose = require('mongoose');
const Course = require('../models/course');
const path = require('path');
const fs = require('fs');

const FORCE = process.argv.includes('--force');

async function seedCourse() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    // Load course data
    const coursePath = path.join(__dirname, '..', 'seeds', 'courses', 'algebra-1.json');
    const courseData = JSON.parse(fs.readFileSync(coursePath, 'utf8'));

    // Check if course already exists
    const existing = await Course.findOne({ courseId: courseData.courseId });

    if (existing && !FORCE) {
      console.log(`Course "${courseData.courseId}" already exists. Use --force to overwrite.`);
      console.log(`  Version: ${existing.version}`);
      console.log(`  Units: ${existing.units.length}`);
      console.log(`  Total lessons: ${existing.units.reduce((s, u) => s + u.lessons.length, 0)}`);
      process.exit(0);
    }

    if (existing && FORCE) {
      console.log(`Overwriting existing course "${courseData.courseId}"...`);
      await Course.deleteOne({ courseId: courseData.courseId });
    }

    // Create the course
    const course = new Course(courseData);
    await course.save();

    // Print summary
    const totalLessons = course.units.reduce((sum, u) => sum + u.lessons.length, 0);
    const totalPhases = course.units.reduce(
      (sum, u) => sum + u.lessons.reduce((s, l) => s + l.phases.length, 0), 0
    );
    const totalAssessments = course.units.reduce(
      (sum, u) => sum + u.lessons.filter(l => l.assessment).length + (u.unitAssessment ? 1 : 0), 0
    );

    console.log('\n=== Course Seeded Successfully ===');
    console.log(`Course: ${course.title} (${course.courseId})`);
    console.log(`Description: ${course.description.substring(0, 100)}...`);
    console.log(`Grade Level: ${course.gradeLevel}`);
    console.log(`Units: ${course.units.length}`);
    console.log(`Total Lessons: ${totalLessons}`);
    console.log(`Total Phases (I Do/We Do/You Do): ${totalPhases}`);
    console.log(`Total Assessments: ${totalAssessments}`);
    console.log('\nUnit Breakdown:');
    for (const unit of course.units) {
      console.log(`  ${unit.order}. ${unit.title} (Q${unit.quarter}) - ${unit.lessons.length} lessons, ~${unit.estimatedDays} days`);
      for (const lesson of unit.lessons) {
        console.log(`     ${unit.order}.${lesson.order} ${lesson.title} (${lesson.estimatedMinutes} min)`);
      }
    }
    console.log('\nEnrollment: ' + (course.enrollment.isOpen ? 'OPEN' : 'CLOSED'));
    console.log('Self-Enroll: ' + (course.enrollment.selfEnrollEnabled ? 'YES' : 'NO'));

  } catch (err) {
    console.error('Error seeding course:', err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

seedCourse();
