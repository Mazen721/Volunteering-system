import type {
  ActivityStatus,
  ActivityType,
  ApplicationStatus,
  ApprovalMode,
  Faculty,
  InterestKey,
  OpportunityPhase,
  OpportunityStatus,
  UserRole,
  UserStatus,
  VolunteerCategory,
} from '../constants/enums';

export interface Admin {
  id: string;
  email: string;
}

export interface RegistrationSnapshot {
  volunteerId: string;
  category: VolunteerCategory;
  faculty: Faculty;
  facultyMismatch: boolean;
}

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  status: UserStatus;
  faculty: Faculty | null;
  volunteer: string | null;
  interests: InterestKey[];
  registration: RegistrationSnapshot | null;
  rejectionReason: string | null;
  lastLoginAt: string | null;
}

export type AuthStatus = 'checking' | 'authenticated' | 'unauthenticated' | 'network_error';

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterPayload {
  email: string;
  password: string;
  fullName: string;
  volunteerId: string;
  category: VolunteerCategory;
  faculty: Faculty;
  interests: InterestKey[];
}

export interface UpdateProfilePayload {
  interests?: InterestKey[];
  currentPassword?: string;
  newPassword?: string;
}

export interface ExistingVolunteerPreview {
  _id: string;
  volunteerId: string;
  fullName: string;
  category: VolunteerCategory;
  faculty: Faculty;
  approvedHours: number;
  approvedActivities: number;
  totalActivities: number;
}

export interface RegistrationQueueItem {
  id: string;
  email: string;
  fullName: string;
  status: UserStatus;
  faculty: Faculty | null;
  volunteer: string | null;
  interests: InterestKey[];
  registration: RegistrationSnapshot;
  facultyMismatch: boolean;
  existingVolunteer: ExistingVolunteerPreview | null;
  rejectionReason: string | null;
  approvedAt: string | null;
  createdAt: string;
}

export interface RegistrationsListResponse {
  registrations: RegistrationQueueItem[];
  total: number;
  page: number;
  pages: number;
}

export interface AuthContextValue {
  user: AuthUser | null;
  admin: Admin | null;
  status: AuthStatus;
  sessionError: string;
  login: (credentials: LoginCredentials) => Promise<AuthUser>;
  register: (payload: RegisterPayload) => Promise<AuthUser>;
  updateProfile: (payload: UpdateProfilePayload) => Promise<AuthUser>;
  logout: () => void;
  retrySession: () => Promise<void>;
}

export type ToastType = 'success' | 'warning' | 'error';

export interface ToastInput {
  type?: ToastType;
  message: string;
}

export interface ToastMessage {
  id: number;
  type: ToastType;
  message: string;
}

export interface ToastContextValue {
  showToast: (toast: ToastInput) => void;
}

export interface CertificateBuckets {
  eligible: number;
  nearEligible: number;
  inProgress: number;
  zeroHours: number;
}

export interface ZeroHourVolunteerRow {
  _id: string;
  volunteerId: string;
  fullName: string;
  category: VolunteerCategory;
  faculty: Faculty;
}

export interface OverviewStats {
  totalApprovedHours: number;
  totalActivities: number;
  approvedActivities: number;
  registeredVolunteers: number;
  activeVolunteers: number;
  eligibleVolunteers: number;
  activeFaculties: number;
  avgHoursPerRegistered: number;
  avgHoursPerActive: number;
  certificateHours: number;
  eventsThisMonth?: number;
  pendingRegistrations?: number;
  pendingApplications?: number;
  certificateBuckets?: CertificateBuckets;
  zeroHourVolunteers?: ZeroHourVolunteerRow[];
}

export interface GroupMetrics {
  volunteerCount: number;
  totalActivities: number;
  approvedActivities: number;
  approvedHours: number;
}

export interface GroupTotals extends GroupMetrics {
  avgHours: number;
}

export interface FacultyStatsRow extends GroupMetrics {
  faculty: string;
  avgHours: number;
  percentage: number;
  activeVolunteers?: number;
  participationRate?: number;
}

export interface ParticipationFunnel {
  applied: number;
  accepted: number;
  attended: number;
  rejected: number;
  noShow: number;
}

export interface EngagementBreakdown {
  joined: number;
  zeroHours: number;
}

export interface ParticipationStatsResponse {
  funnel: ParticipationFunnel;
  engagement: EngagementBreakdown;
}

export interface EventEfficiencyRow {
  _id: string;
  title: string;
  faculty: Faculty | null;
  status: OpportunityStatus;
  startAt: string;
  hours: number;
  totalSlots: number;
  acceptedCount: number;
  attendedCount: number;
  noShowCount: number;
  fillRate: number;
  noShowRate: number;
}

export interface EventStatsSummary {
  totalEvents: number;
  completedCount: number;
  avgFillRate: number;
  avgNoShowRate: number;
}

export interface EventStatsResponse {
  topEvents: EventEfficiencyRow[];
  completedEvents: EventEfficiencyRow[];
  summary: EventStatsSummary;
}

export interface MonthlyHoursPoint {
  month: string;
  label: string;
  approvedHours: number;
  approvedActivities: number;
}

export interface MonthlyHoursResponse {
  months: MonthlyHoursPoint[];
}

export interface FacultyStatsResponse {
  faculties: FacultyStatsRow[];
  totals: GroupTotals;
}

export interface CategoryStatsRow extends GroupMetrics {
  category: VolunteerCategory;
  label: string;
  avgHours: number;
}

export interface CategoryStatsResponse {
  categories: CategoryStatsRow[];
  totals: GroupTotals;
}

export interface VolunteerBase {
  _id?: string;
  volunteerId: string;
  fullName: string;
  category: VolunteerCategory;
  categoryLabel?: string;
  faculty: string;
}

export interface Volunteer extends VolunteerBase {
  _id: string;
  totalActivities: number;
  approvedActivities: number;
  approvedHours: number;
  remainingHours: number;
  eligible: boolean;
  linkedUserId?: string | null;
}

export interface VolunteerInput {
  volunteerId: string;
  fullName: string;
  category: VolunteerCategory;
  faculty: string;
}

export interface LeaderboardVolunteer {
  _id: string;
  volunteerId: string;
  fullName: string;
  category: VolunteerCategory;
  categoryLabel: string;
  faculty: string;
  approvedActivities: number;
  approvedHours: number;
}

export interface LeaderboardResponse {
  leaderboard: LeaderboardVolunteer[];
  certificateHours: number;
}

export interface Activity {
  _id: string;
  volunteer?: string | VolunteerBase;
  title: string;
  type: ActivityType;
  hours: number;
  date: string;
  status: ActivityStatus;
  supervisor: string;
  opportunity?: string | null;
  application?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface VolunteerListResponse {
  volunteers: Volunteer[];
  total: number;
  page: number;
  pages: number;
  certificateHours: number;
}

export interface VolunteerProfileResponse {
  volunteer: Volunteer;
  activities: Activity[];
  certificateHours: number;
}

export interface ImportRowError {
  sheet?: string;
  rowNumber: number;
  message: string;
}

export interface ImportConflict {
  rowNumber: number;
  volunteerId?: string;
  fullName?: string;
  activityFaculty?: string;
  volunteerFaculty?: string;
  activityCategory?: string;
  volunteerCategory?: string;
  message: string;
}

export interface ImportDuplicate {
  rowNumber: number;
  type?: 'exact' | 'possible';
  volunteerId?: string;
  title?: string;
  date?: string;
  source?: string;
  previousDate?: string;
  message: string;
}

export interface ImportPreview {
  volunteersCount: number;
  activitiesCount: number;
  errors: ImportRowError[];
  conflicts: ImportConflict[];
  duplicates: ImportDuplicate[];
  skippedExactDuplicates: number;
}

export interface ImportSummary {
  volunteersCreated: number;
  volunteersUpdated: number;
  activitiesCreated: number;
  skippedDuplicates: number;
}

export interface ImportPreviewResult {
  committed: false;
  preview: ImportPreview;
}

export interface ImportCommitResult {
  committed: true;
  summary: ImportSummary;
  preview: ImportPreview;
}

export type ImportResult = ImportPreviewResult | ImportCommitResult;

export interface DashboardStatsBundle {
  overview: OverviewStats;
  faculties: FacultyStatsRow[];
  leaderboard: LeaderboardVolunteer[];
  certificateHours: number;
  participation: ParticipationStatsResponse | null;
  events: EventStatsResponse | null;
  monthlyHours: MonthlyHoursPoint[];
  analyticsError: string;
}

export interface VolunteerFilters {
  search: string;
  category: VolunteerCategory | '';
  faculty: Faculty | '';
  eligibility: 'eligible' | 'in_progress' | '';
  activityStatus: ActivityStatus | '';
}

export interface VolunteerFormState {
  volunteerId: string;
  fullName: string;
  category: VolunteerCategory;
  faculty: Faculty | '';
}

export type VolunteerFieldErrors = Partial<Record<keyof VolunteerFormState, string>>;

export interface ActivityFormState {
  volunteerId: string;
  title: string;
  type: ActivityType;
  hours: string;
  date: string;
  supervisor: string;
  status: ActivityStatus;
}

export type ActivityFieldErrors = Partial<Record<keyof ActivityFormState, string>>;

export interface UsersListResponse {
  users: AuthUser[];
}

export interface CreateDeanPayload {
  email: string;
  fullName: string;
  faculty: Faculty;
  password: string;
}

export interface UpdateUserPayload {
  status?: 'active' | 'disabled';
  fullName?: string;
  faculty?: Faculty;
  temporaryPassword?: string;
}

export interface ActivityListResponse {
  activities: Activity[];
  total: number;
  page: number;
  pages: number;
}

export interface CategoryCounts {
  student: number;
  academic: number;
  admin: number;
}

export interface OpportunityLocation {
  name: string;
  address: string;
  mapUrl?: string;
}

export interface Opportunity {
  _id: string;
  title: string;
  description: string;
  requirements: string;
  fields: InterestKey[];
  activityType: ActivityType;
  location: OpportunityLocation;
  startAt: string;
  endAt: string;
  registrationDeadline: string;
  hours: number;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  faculty: Faculty | null;
  slots: CategoryCounts;
  acceptedCounts: CategoryCounts;
  approvalMode: ApprovalMode;
  status: OpportunityStatus;
  createdBy: string;
  attendanceDeputy?: string | null;
  createdAt: string;
  updatedAt: string;
  phase: OpportunityPhase;
  checkInOpen: boolean;
  remainingSlots: CategoryCounts;
  recommendationScore?: number;
  matchedFields?: InterestKey[];
  isFull?: boolean;
  waitlistAvailable?: boolean;
  myApplication?: Application;
}

export interface Application {
  _id: string;
  opportunity: string;
  volunteer: string | VolunteerBase;
  user: string;
  faculty: Faculty;
  category: VolunteerCategory;
  status: ApplicationStatus;
  note: string;
  decidedBy: string | null;
  decidedAt: string | null;
  attended: boolean;
  checkedInAt: string | null;
  hoursGranted: number;
  appliedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface OpportunityListResponse {
  opportunities: Opportunity[];
}

export interface OpportunityResponse {
  opportunity: Opportunity;
}

export interface OpportunityApplicantsResponse {
  applications: Application[];
  readOnly: boolean;
}

export interface StudentVolunteer extends VolunteerBase {
  _id: string;
  createdAt: string;
  updatedAt: string;
}

export interface StudentApplication extends Omit<Application, 'opportunity'> {
  opportunity: Opportunity;
}

export interface StudentApplicationsResponse {
  applications: StudentApplication[];
}

export interface StudentDashboardSummary {
  volunteer: StudentVolunteer | null;
  approvedHours: number;
  pendingHours: number;
  certificateHours: number;
  remainingHours: number;
  eligible: boolean;
  eventsAttended: number;
  happeningNow: Opportunity[];
  upcomingAccepted: Opportunity[];
  activeApplications: StudentApplication[];
  recentActivities: Activity[];
}

export interface OpportunityFormState {
  title: string;
  description: string;
  requirements: string;
  fields: InterestKey[];
  activityType: ActivityType;
  locationName: string;
  locationAddress: string;
  locationMapUrl: string;
  startAt: string;
  endAt: string;
  registrationDeadline: string;
  hours: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  faculty: Faculty | '';
  studentSlots: string;
  academicSlots: string;
  adminSlots: string;
  approvalMode: ApprovalMode;
}

export type OpportunityFieldErrors = Partial<
  Record<keyof OpportunityFormState | 'slots' | 'fields', string>
>;

export interface SettingsResponse {
  settings: {
    key: string;
    certificateHours: number;
  };
  certificateHours: number;
}

export interface CheckInTokenResponse {
  token: string;
  expiresAt: string;
}

export interface LiveCounters {
  accepted: number;
  checkedIn: number;
  notArrived: number;
}

export interface LiveOpportunityResponse {
  opportunity: Opportunity;
  counters: LiveCounters;
  attendees: Application[];
}

export interface CompleteOpportunityResponse {
  opportunity: Opportunity;
  creditedCount: number;
  noShowCount: number;
}

export interface CheckInSubmitResponse {
  application: Application;
}
