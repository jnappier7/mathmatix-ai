// pick-tutor-carousel.js
// Date: Monday, June 9, 2025 at 3:52:32 PM EDT
document.addEventListener('DOMContentLoaded', () => {
    const tutors = [
        {
            id: 'mr-nappier',
            name: 'Mr. Nappier',
            image: 'mr-nappier.png', // Corrected: removed 'images/' prefix
            catchphrase: "Math is about patterns! Once you see the patterns math becomes EASY",
            about: "Mr. Nappier believes math is an adventure, not a chore! He's enthusiastic about helping students conquer their math challenges by breaking down complex problems into simple, understandable steps. Whether it's tricky fractions or intimidating algebra, Mr. Nappier's friendly and patient approach makes learning math fun and accessible.",
            specialties: "Foundational Math (Arithmetic, Fractions, Decimals), Pre-Algebra, Algebra 1, building math confidence.",
            likes: "He makes math less scary and always finds a way to explain it so I finally get it!"
        },
        {
            id: 'mr-lee',
            name: 'Mr. Lee',
            image: 'mr-lee.png', // Corrected
            catchphrase: "Precision and clarity for every math concept.",
            about: "Mr. Lee is dedicated to building strong mathematical understanding. With a calm and methodical approach, he ensures students grasp not just *how* to solve problems, but *why* the methods work. He's excellent at guiding students through logical reasoning and complex problem-solving step-by-step, ensuring a solid foundation in all areas of math.",
            specialties: "Algebra I & II, Geometry, Problem-Solving Strategies, developing logical thinking in math.",
            likes: "He's incredibly clear and patient. My grades in Algebra improved a lot thanks to him."
        },
        {
            id: 'dr-jones',
            name: 'Dr. Jones',
            image: 'dr-jones.png', // Corrected
            catchphrase: "Unlock the logic behind the numbers!",
            about: "Dr. Jones is passionate about critical thinking and loves to encourage students to ask 'why' in math. She brings a thoughtful and encouraging presence to every session, helping students develop strong analytical skills and a deeper appreciation for mathematical principles. She's great at preparing students for advanced topics.",
            specialties: "Pre-Calculus, Calculus AB, Statistics, advanced problem-solving, mathematical theory.",
            likes: "She challenges me to think more deeply about math, and now I see it in a whole new way!"
        },
        {
            id: 'prof-davies',
            name: 'Professor Davies',
            image: 'prof-davies.png', // Corrected
            catchphrase: "Years of wisdom, tailored to your math journey.",
            about: "Professor Davies brings a wealth of teaching experience and a warm demeanor to his math tutoring sessions. He excels at making complex mathematical concepts accessible and relatable, drawing on real-world examples to enhance understanding. He's a true mentor for any student looking to master challenging math.",
            specialties: "Advanced Algebra, Trigonometry, Test Preparation (SAT/ACT Math), conceptual understanding.",
            likes: "He explains things so well and makes even the hardest math subjects seem manageable and interesting."
        },
        {
            id: 'ms-alex',
            name: 'Ms. Alex',
            image: 'ms-alex.png', // Corrected
            catchphrase: "Let's master those tricky math topics together!",
            about: "Alex is energetic and engaging, making every math lesson interactive and enjoyable. He's great at breaking down challenging concepts, finding creative ways to help students remember formulas and processes, and boosting confidence. He's a firm believer that anyone can succeed in math with the right guidance.",
            specialties: "Middle School Math, Algebra I, Geometry, Homework Help, building confidence.",
            likes: "He's super clear and enthusiastic, and he always helps me understand the steps to solve any problem."
        },
        {
            id: 'maya',
            name: 'Maya',
            image: 'maya.png', // Corrected
            catchphrase: "Learning math, your way!",
            about: "Maya is a friendly and approachable tutor who understands that everyone learns math differently. She's patient, adapts to individual learning paces, and is fantastic at building confidence in students who might feel intimidated by numbers. She makes sure students feel comfortable asking any question, no matter how small.",
            specialties: "Elementary Math, Basic Algebra, building fundamental math skills, individualized learning plans.",
            likes: "She's really understanding and helps me work through math problems at my own pace until I really get it."
        },
        {
            id: 'ms-maria',
            name: 'Ms. Maria',
            image: 'ms-maria.png', // Corrected
            catchphrase: "Structured math learning for solid results.",
            about: "Ms. Anya is organized and thorough, providing a structured approach to math that helps students stay on track and achieve their goals. She's excellent at guiding students through curriculum requirements, test preparation, and ensuring a deep understanding of mathematical concepts.",
            specialties: "Bi-Lingual (Spanish/English), Pre-Algebra, Algebra I & II, Test Prep (e.g., state math tests), building strong foundational math skills.",
            likes: "She's very organized and helps me plan my math studying, which really works for me."
        },
        {
            id: 'bob',
            name: 'Bob',
            image: 'bob.png', // Corrected
            catchphrase: "Bringing math concepts to life!",
            about: "Bob is an engaging and imaginative math tutor who loves to make learning vivid and memorable. He excels at connecting new mathematical information to real-world applications, helping students form a deeper and more lasting understanding of concepts. He makes even abstract math relatable.",
            specialties: "Geometry, Pre-Calculus, creative problem-solving, understanding theoretical math concepts.",
            likes: "He makes every math topic so interesting, and I learn so much more than just the formulas!"
        }
    ];

    const carouselTrack = document.querySelector('.carousel-track');
    const prevButton = document.querySelector('.carousel-button.prev');
    const nextButton = document.querySelector('.carousel-button.next');
    const selectTutorBtn = document.getElementById('select-tutor-btn');

    const tutorName = document.getElementById('tutor-name');
    const tutorCatchphrase = document.getElementById('tutor-catchphrase');
    const tutorAbout = document.getElementById('tutor-about');
    const tutorSpecialties = document.getElementById('tutor-specialties');
    const tutorLikes = document.getElementById('tutor-likes');

    let currentIndex = 0; // Tracks the currently displayed tutor

    // Function to render tutors in the carousel
    function renderTutors() {
        carouselTrack.innerHTML = ''; // Clear existing slides
        tutors.forEach(tutor => {
            const slide = document.createElement('li');
            slide.classList.add('carousel-slide');
            const img = document.createElement('img');
            img.src = `images/${tutor.image}`; // Correctly points to /public/images/filename.png
            img.alt = `3D avatar of ${tutor.name}`;
            img.classList.add('tutor-image');
            slide.appendChild(img);
            carouselTrack.appendChild(slide);
        });
    }

    // Function to update tutor details display
    function updateTutorDetails(index) {
        const currentTutor = tutors[index];
        tutorName.textContent = currentTutor.name;
        tutorCatchphrase.textContent = `"${currentTutor.catchphrase}"`;
        tutorAbout.textContent = currentTutor.about;
        tutorSpecialties.textContent = currentTutor.specialties;
        tutorLikes.textContent = currentTutor.likes;
        // Optionally, update the select button text
        selectTutorBtn.textContent = `Select ${currentTutor.name}`;
    }

    // Function to move the carousel
    function moveCarousel() {
        // Ensure carouselTrack has children before trying to access them
        if (carouselTrack.children.length === 0) return;

        const slideWidth = carouselTrack.children[0].getBoundingClientRect().width;
        carouselTrack.style.transform = `translateX(-${currentIndex * slideWidth}px)`;
        updateTutorDetails(currentIndex);
    }

    // Event listeners for carousel navigation
    prevButton.addEventListener('click', () => {
        currentIndex = (currentIndex === 0) ? tutors.length - 1 : currentIndex - 1;
        moveCarousel();
    });

    nextButton.addEventListener('click', () => {
        currentIndex = (currentIndex === tutors.length - 1) ? 0 : currentIndex + 1;
        moveCarousel();
    });

    // Event listener for the "Select Tutor" button
    selectTutorBtn.addEventListener('click', async () => {
        const selectedTutor = tutors[currentIndex];
        const userId = localStorage.getItem("userId"); // Assuming userId is stored in localStorage

        if (!userId) {
            alert("User not logged in. Please log in.");
            window.location.href = "/login.html"; // Redirect to login
            return;
        }

        try {
            // Send selected tutor ID to your backend
            const response = await fetch("/chat/select-tutor", { // MODIFIED URL to '/chat/select-tutor'
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Requested-With": "XMLHttpRequest"
                },
                credentials: 'include', // Important for sending cookies/session
                body: JSON.stringify({ userId: userId, tutorId: selectedTutor.id })
            });

            const result = await response.json();

            if (result.success) {
                // Store selected tutor ID in localStorage for chat page
                localStorage.setItem("selectedTutorId", selectedTutor.id); // Store the ID
                localStorage.setItem("selectedTutorName", selectedTutor.name); // Store the name for convenience

                alert(`You have selected ${selectedTutor.name}! Redirecting to chat...`);
                window.location.href = "/chat.html"; // Redirect to your chat page
            } else {
                alert("Failed to select tutor: " + (result.message || "Unknown error"));
            }
        } catch (error) {
            console.error("Error selecting tutor:", error);
            alert("An error occurred while selecting your tutor. Please try again.");
        }
    });

    // Initial render and display
    renderTutors();
    updateTutorDetails(currentIndex); // Display details for the first tutor initially
    // Ensure correct positioning after images load
    window.addEventListener('load', moveCarousel);
});