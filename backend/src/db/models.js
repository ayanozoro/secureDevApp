/**
 * Mongoose Models for SecureDevOps Persistence
 * Collections: users, repositories, scans, activities, logs
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;

const UserSchema = new Schema(
  {
    githubId: { type: Number, index: true, sparse: true },
    login: { type: String, required: true, unique: true, lowercase: true, trim: true },
    displayLogin: { type: String },
    name: { type: String },
    email: { type: String, trim: true },
    avatarUrl: { type: String },
    htmlUrl: { type: String },
    accessToken: { type: String },
    publicRepos: { type: Number, default: 0 },
    privateRepos: { type: Number, default: 0 },
    lastLoginAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

const RepositorySchema = new Schema(
  {
    fullName: { type: String, required: true, unique: true, lowercase: true, trim: true },
    displayName: { type: String },
    userLogin: { type: String, index: true, lowercase: true, trim: true },
    userEmail: { type: String, trim: true },
    hookId: { type: Schema.Types.Mixed, default: null },
    webhookActive: { type: Boolean, default: false },
    defaultBranch: { type: String, default: 'main' },
    lastScannedAt: { type: Date },
  },
  { timestamps: true },
);

const ScanSchema = new Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    userLogin: { type: String, index: true, lowercase: true, trim: true, default: null },
    event: { type: String },
    repoName: { type: String, index: true },
    repoUrl: { type: String },
    isPrivate: { type: Boolean, default: false },
    branch: { type: String },
    commitSha: { type: String },
    fullCommitSha: { type: String },
    pullNumber: { type: Number, default: null },
    commitMessage: { type: String },
    authorName: { type: String },
    authorEmail: { type: String },
    authorAvatar: { type: String },
    packagePath: { type: String },
    status: { type: String, default: 'completed' },
    error: { type: String },
    scannedAt: { type: String, index: true },
    totalPackages: { type: Number, default: 0 },
    vulnerableCount: { type: Number, default: 0 },
    cleanCount: { type: Number, default: 0 },
    criticalCount: { type: Number, default: 0 },
    highCount: { type: Number, default: 0 },
    mediumCount: { type: Number, default: 0 },
    lowCount: { type: Number, default: 0 },
    packages: { type: [Schema.Types.Mixed], default: [] },
    vulnerabilities: { type: [Schema.Types.Mixed], default: [] },
    offlineMode: { type: Boolean, default: false },
    emailSentTo: { type: String, default: null },
    githubReport: { type: Schema.Types.Mixed, default: null },
    fixPr: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: true },
);

ScanSchema.index({ userLogin: 1, scannedAt: -1 });
ScanSchema.index({ repoName: 1, scannedAt: -1 });

const ActivitySchema = new Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    userLogin: { type: String, index: true, lowercase: true, trim: true, default: null },
    event: { type: String },
    repository: { type: String, index: true },
    commitSha: { type: String },
    fullCommitSha: { type: String },
    ref: { type: String },
    timestamp: { type: String, index: true },
    status: { type: String },
    message: { type: String },
    totalDependencies: { type: Number },
    findingsCount: { type: Number },
    vulnerabilities: { type: [String], default: [] },
    scannedProjectsCount: { type: Number },
    scans: { type: [Schema.Types.Mixed], default: [] },
  },
  { timestamps: true },
);

ActivitySchema.index({ userLogin: 1, timestamp: -1 });

const LogSchema = new Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    userLogin: { type: String, index: true, lowercase: true, trim: true, default: null },
    type: { type: String },
    message: { type: String },
    details: { type: Schema.Types.Mixed, default: {} },
    timestamp: { type: String, index: true },
    source: { type: String, default: 'vulnwatch' },
  },
  { timestamps: true },
);

LogSchema.index({ userLogin: 1, timestamp: -1 });

const User = mongoose.models.User || mongoose.model('User', UserSchema);
const Repository = mongoose.models.Repository || mongoose.model('Repository', RepositorySchema);
const Scan = mongoose.models.Scan || mongoose.model('Scan', ScanSchema);
const Activity = mongoose.models.Activity || mongoose.model('Activity', ActivitySchema);
const Log = mongoose.models.Log || mongoose.model('Log', LogSchema);

module.exports = {
  User,
  Repository,
  Scan,
  Activity,
  Log,
};
