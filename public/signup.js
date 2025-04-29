const gradeSelect = document.getElementById('grade');
const mathCourseSection = document.getElementById('math-course-section');
const advancedMathQuestion = document.getElementById('advanced-math-question');

// Handle grade changes
gradeSelect.addEventListener('change', () => {
  const grade = gradeSelect.value;

  if (grade === "7" || grade === "8") {
    advancedMathQuestion.classList.remove('hidden');
    mathCourseSection.classList.add('hidden');
  } else if (grade === "9" || grade === "10" || grade === "11" || grade === "12" || grade === "College") {
    advancedMathQuestion.classList.add('hidden');
    mathCourseSection.classList.remove('hidden');
  } else {
    advancedMathQuestion.classList.add('hidden');
    mathCourseSection.classList.add('hidden');
  }
});

// Handle advanced math yes/no
const advancedMathRadios = document.getElementsByName('advancedMath');
advancedMathRadios.forEach(radio => {
  radio.addEventListener('change', () => {
    if (radio.value === 'yes') {
      mathCourseSection.classList.remove('hidden');
    } else {
      mathCourseSection.classList.add('hidden');
    }
  });
});
// JavaScript Document