/**
 * Tests for Data Privacy Pipeline
 * Verifies cascade deletion logic and data export
 */

const { cascadeDeleteStudentData, exportStudentData } = require('../../routes/dataPrivacy');

// Mock all Mongoose models
jest.mock('../../models/user');
jest.mock('../../models/conversation');
jest.mock('../../models/courseSession');
jest.mock('../../models/screenerSession');
jest.mock('../../models/gradingResult');
jest.mock('../../models/studentUpload');
jest.mock('../../models/feedback');
jest.mock('../../models/enrollmentCode');
jest.mock('../../models/announcement');
jest.mock('../../models/impersonationLog');
jest.mock('../../models/message');

// Mock mongoose for session collection access
jest.mock('mongoose', () => {
    const actual = jest.requireActual('mongoose');
    return {
        ...actual,
        Types: actual.Types,
        connection: {
            collection: jest.fn().mockReturnValue({
                deleteMany: jest.fn().mockResolvedValue({ deletedCount: 0 })
            })
        }
    };
});

const User = require('../../models/user');
const Conversation = require('../../models/conversation');
const CourseSession = require('../../models/courseSession');
const ScreenerSession = require('../../models/screenerSession');
const GradingResult = require('../../models/gradingResult');
const StudentUpload = require('../../models/studentUpload');
const Feedback = require('../../models/feedback');
const EnrollmentCode = require('../../models/enrollmentCode');
const Announcement = require('../../models/announcement');
const ImpersonationLog = require('../../models/impersonationLog');
const Message = require('../../models/message');

describe('Data Privacy Pipeline', () => {

    beforeEach(() => {
        jest.clearAllMocks();

        // Default: student exists
        User.findById = jest.fn().mockResolvedValue({
            _id: '507f1f77bcf86cd799439011',
            role: 'student',
            roles: ['student'],
            firstName: 'Sarah',
            lastName: 'Chen'
        });

        // Default: all deletions succeed
        Conversation.deleteMany = jest.fn().mockResolvedValue({ deletedCount: 5 });
        CourseSession.deleteMany = jest.fn().mockResolvedValue({ deletedCount: 2 });
        ScreenerSession.deleteMany = jest.fn().mockResolvedValue({ deletedCount: 1 });
        GradingResult.deleteMany = jest.fn().mockResolvedValue({ deletedCount: 10 });
        StudentUpload.deleteMany = jest.fn().mockResolvedValue({ deletedCount: 3 });
        Feedback.deleteMany = jest.fn().mockResolvedValue({ deletedCount: 1 });
        Message.deleteMany = jest.fn().mockResolvedValue({ deletedCount: 4 });
        EnrollmentCode.updateMany = jest.fn().mockResolvedValue({ modifiedCount: 1 });
        Announcement.updateMany = jest.fn().mockResolvedValue({ modifiedCount: 0 });
        ImpersonationLog.updateMany = jest.fn().mockResolvedValue({ modifiedCount: 2 });
        User.updateMany = jest.fn().mockResolvedValue({ modifiedCount: 1 });
        User.findByIdAndDelete = jest.fn().mockResolvedValue({});
    });

    // ========================================================================
    // cascadeDeleteStudentData
    // ========================================================================
    describe('cascadeDeleteStudentData', () => {
        const studentId = '507f1f77bcf86cd799439011';
        const requestor = { userId: 'admin123', role: 'admin', reason: 'Test deletion' };

        test('deletes data from all collections', async () => {
            const summary = await cascadeDeleteStudentData(studentId, requestor);

            // Verify all collections were queried
            expect(Conversation.deleteMany).toHaveBeenCalled();
            expect(CourseSession.deleteMany).toHaveBeenCalled();
            expect(ScreenerSession.deleteMany).toHaveBeenCalled();
            expect(GradingResult.deleteMany).toHaveBeenCalled();
            expect(StudentUpload.deleteMany).toHaveBeenCalled();
            expect(Feedback.deleteMany).toHaveBeenCalled();
            expect(Message.deleteMany).toHaveBeenCalled();
            expect(User.findByIdAndDelete).toHaveBeenCalled();

            // Verify enrollment codes are updated, not deleted
            expect(EnrollmentCode.updateMany).toHaveBeenCalled();

            // Verify impersonation logs are anonymized, not deleted
            expect(ImpersonationLog.updateMany).toHaveBeenCalled();
        });

        test('returns accurate document counts', async () => {
            const summary = await cascadeDeleteStudentData(studentId, requestor);

            expect(summary.documentCounts.conversations).toBe(5);
            expect(summary.documentCounts.courseSessions).toBe(2);
            expect(summary.documentCounts.screenerSessions).toBe(1);
            expect(summary.documentCounts.gradingResults).toBe(10);
            expect(summary.documentCounts.studentUploads).toBe(3);
            expect(summary.documentCounts.feedback).toBe(1);
            expect(summary.documentCounts.messages).toBe(4);
            expect(summary.documentCounts.userDocument).toBe(1);
        });

        test('includes audit metadata', async () => {
            const summary = await cascadeDeleteStudentData(studentId, requestor);

            expect(summary.targetUserId).toBe(studentId);
            expect(summary.requestedBy).toBe('admin123');
            expect(summary.requestedByRole).toBe('admin');
            expect(summary.reason).toBe('Test deletion');
            expect(summary.startedAt).toBeInstanceOf(Date);
            expect(summary.completedAt).toBeInstanceOf(Date);
            expect(summary.durationMs).toBeGreaterThanOrEqual(0);
        });

        test('throws if student not found', async () => {
            User.findById = jest.fn().mockResolvedValue(null);

            await expect(
                cascadeDeleteStudentData(studentId, requestor)
            ).rejects.toThrow('Student not found');
        });

        test('throws if target is not a student', async () => {
            User.findById = jest.fn().mockResolvedValue({
                _id: studentId,
                role: 'teacher',
                roles: ['teacher']
            });

            await expect(
                cascadeDeleteStudentData(studentId, requestor)
            ).rejects.toThrow('Target user is not a student');
        });

        test('continues on individual collection errors', async () => {
            Conversation.deleteMany = jest.fn().mockRejectedValue(new Error('DB timeout'));

            const summary = await cascadeDeleteStudentData(studentId, requestor);

            // Should still delete other collections
            expect(CourseSession.deleteMany).toHaveBeenCalled();
            expect(GradingResult.deleteMany).toHaveBeenCalled();
            expect(User.findByIdAndDelete).toHaveBeenCalled();

            // Error recorded
            expect(summary.errors.length).toBe(1);
            expect(summary.errors[0].collection).toBe('conversations');
        });

        test('lists affected collections', async () => {
            const summary = await cascadeDeleteStudentData(studentId, requestor);

            expect(summary.collectionsAffected).toContain('conversations');
            expect(summary.collectionsAffected).toContain('courseSessions');
            expect(summary.collectionsAffected).toContain('users');
        });

        test('unlinks from parent accounts', async () => {
            const summary = await cascadeDeleteStudentData(studentId, requestor);

            expect(User.updateMany).toHaveBeenCalledWith(
                expect.objectContaining({ children: expect.anything() }),
                expect.objectContaining({ $pull: expect.anything() })
            );
        });
    });

    // ========================================================================
    // exportStudentData
    // ========================================================================
    describe('exportStudentData', () => {
        const studentId = '507f1f77bcf86cd799439011';

        beforeEach(() => {
            // Setup lean query chains for export
            User.findById = jest.fn().mockReturnValue({
                select: jest.fn().mockReturnValue({
                    lean: jest.fn().mockResolvedValue({
                        _id: studentId,
                        firstName: 'Sarah',
                        lastName: 'Chen',
                        role: 'student'
                    })
                })
            });

            Conversation.find = jest.fn().mockReturnValue({
                lean: jest.fn().mockResolvedValue([
                    { _id: 'conv1', messages: [{ role: 'user', content: 'Help with fractions' }] }
                ])
            });

            CourseSession.find = jest.fn().mockReturnValue({
                lean: jest.fn().mockResolvedValue([])
            });

            ScreenerSession.find = jest.fn().mockReturnValue({
                lean: jest.fn().mockResolvedValue([])
            });

            GradingResult.find = jest.fn().mockReturnValue({
                lean: jest.fn().mockResolvedValue([])
            });

            StudentUpload.find = jest.fn().mockReturnValue({
                select: jest.fn().mockReturnValue({
                    lean: jest.fn().mockResolvedValue([])
                })
            });

            Feedback.find = jest.fn().mockReturnValue({
                lean: jest.fn().mockResolvedValue([])
            });

            Message.find = jest.fn().mockReturnValue({
                lean: jest.fn().mockResolvedValue([])
            });
        });

        test('compiles all student data', async () => {
            const data = await exportStudentData(studentId);

            expect(data.exportDate).toBeDefined();
            expect(data.exportVersion).toBe('1.0');
            expect(data.student.profile.firstName).toBe('Sarah');
            expect(data.student.conversations).toHaveLength(1);
        });

        test('excludes sensitive auth fields', async () => {
            await exportStudentData(studentId);

            // Verify select() was called to exclude sensitive fields
            const selectCall = User.findById().select;
            expect(selectCall).toHaveBeenCalledWith(
                expect.stringContaining('-passwordHash')
            );
        });

        test('excludes binary file data from uploads', async () => {
            await exportStudentData(studentId);

            // Verify select() was called to exclude file data
            const selectCall = StudentUpload.find().select;
            expect(selectCall).toHaveBeenCalledWith('-fileData');
        });
    });
});
