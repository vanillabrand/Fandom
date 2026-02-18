import { StandardizedProfile } from '../types.js';
import { MetricNormalizationService } from './MetricNormalizationService.js';

export class ProfileNormalizationService {
    /**
     * NORMALIZATION HELPER
     * Maps disparate scraper outputs to a unified StandardizedProfile
     */
    public static normalize(record: any): StandardizedProfile | null {
        // DEFAULT: Empty Profile
        const standard: StandardizedProfile = {
            id: '',
            username: '',
            fullName: null,
            biography: null,
            profilePicUrl: null,
            externalUrl: null,
            followersCount: null,
            followsCount: null,
            isPrivate: null,
            isVerified: null,
            isBusinessAccount: null,
            postsCount: null,
            engagementRate: null,
            latestPosts: [],
            relatedProfiles: [] // [NEW] Initialize
        };

        try {
            // DETECT SOURCE SCHEMA

            // 1. Instagram API Scraper - Post/Details Mode (Rich 'metaData' Object)
            if (record.metaData) {
                const meta = record.metaData;
                standard.id = meta.id || record.ownerId || '';
                standard.username = meta.username || record.ownerUsername || '';
                standard.fullName = meta.fullName;
                standard.biography = meta.biography;
                standard.profilePicUrl = meta.profilePicUrl;

                // [ROBUST] Extract Metrics using Unified Helper
                standard.followersCount = MetricNormalizationService.extract(meta, 'followers') || MetricNormalizationService.extract(record, 'followers');
                standard.followsCount = MetricNormalizationService.extract(meta, 'following') || MetricNormalizationService.extract(record, 'following');
                standard.postsCount = MetricNormalizationService.extract(meta, 'posts') || MetricNormalizationService.extract(record, 'posts');

                standard.isPrivate = meta.isPrivate;
                standard.isVerified = meta.isVerified;
                standard.isBusinessAccount = meta.isBusinessAccount;
                standard.externalUrl = meta.externalUrl || meta.url;
                // ...
            }
            // 2. Instagram Profile Scraper (Deep Dive - 'owner' object or flat)
            else if (record.edge_followed_by || record.biography !== undefined || record.bio !== undefined || record.followerCount !== undefined || record.followersCount !== undefined || record.followers_count !== undefined) {
                standard.id = record.id || record.pk || record.ownerId || record.userId;
                standard.username = record.username || record.ownerUsername || record.handle;
                standard.fullName = record.full_name || record.fullName || record.name;
                standard.biography = record.biography || record.bio || record.description;
                standard.profilePicUrl = record.profile_pic_url_hd || record.profile_pic_url || record.profilePicUrl || record.profilePic;

                // [ROBUST] Use unified extractor to catch all aliases
                standard.followersCount = MetricNormalizationService.extract(record, 'followers');
                standard.followsCount = MetricNormalizationService.extract(record, 'following');
                standard.postsCount = MetricNormalizationService.extract(record, 'posts');

                standard.isPrivate = record.is_private || record.isPrivate || record.private;
                standard.isVerified = record.is_verified || record.isVerified || record.verified;
                standard.isBusinessAccount = record.is_business_account || record.isBusinessAccount;
                standard.externalUrl = record.external_url || record.externalUrl || record.url;

            }
            // 4. Instagram Network Scraper (Followers/Following - Minimal)
            else if ((record.username) && (record.followed_by_viewer !== undefined || record.requested_by_viewer !== undefined)) {
                standard.id = record.id ? String(record.id) : '';
                standard.username = record.username;
                standard.fullName = record.full_name;
                standard.profilePicUrl = record.profile_pic_url;
                standard.isPrivate = record.is_private;
                standard.isVerified = record.is_verified;

                // Use extractMetric to catch all aliases and avoid hardcoded 0 fallbacks
                standard.followersCount = MetricNormalizationService.extract(record, 'followers');
                standard.followsCount = MetricNormalizationService.extract(record, 'following');
                standard.postsCount = MetricNormalizationService.extract(record, 'posts');
            }
            // 5. Instagram Hashtag Scraper / Post Scraper (Post-centric - 'ownerUsername' or 'ownerId')
            else if (record.ownerUsername || record.ownerId) {
                standard.id = record.ownerId || '';
                standard.username = record.ownerUsername || '';
                standard.fullName = record.ownerFullName || null;
                standard.profilePicUrl = record.ownerProfilePicUrl || null;

                // For hashtag posts, we map the post itself into latestPosts
                standard.latestPosts = [{
                    id: record.id,
                    caption: record.caption || '',
                    url: record.url || (record.shortCode ? `https://www.instagram.com/p/${record.shortCode}/` : ''),
                    displayUrl: record.displayUrl || record.videoUrl || record.url,
                    timestamp: record.timestamp,
                    likesCount: record.likesCount || 0,
                    commentsCount: record.commentsCount || 0,
                    type: record.type === 'Video' ? 'Video' : (record.type === 'Sidecar' ? 'Sidecar' : 'Image'),
                    videoUrl: record.videoUrl,
                    videoViewCount: record.videoViewCount
                }];
            }
            // Fallback (Generic mapping for miscellaneous scraper formats)
            else {
                standard.id = record.id || record.pk || record.userId || record.ownerId || record.data?.id || record.data?.pk || '';
                standard.username = (record.username || record.ownerUsername || record.handle || record.data?.username || record.data?.handle || '').toLowerCase().replace('@', '');
                standard.fullName = record.fullName || record.full_name || record.name || record.data?.fullName || record.data?.full_name || record.data?.name || standard.fullName;

                standard.followersCount = MetricNormalizationService.extract(record, 'followers');
                standard.followsCount = MetricNormalizationService.extract(record, 'following');
                standard.postsCount = MetricNormalizationService.extract(record, 'posts');

                const rawBio = record.biography || record.bio || record.description || record.data?.biography || record.data?.bio || record.data?.description;
                standard.biography = (rawBio && !/Bio unavailable|No bio/i.test(rawBio)) ? rawBio : standard.biography;
                standard.profilePicUrl = record.profilePicUrl || record.profile_pic_url || record.profilePic || record.data?.profilePicUrl || record.data?.profile_pic_url || record.data?.profilePic || standard.profilePicUrl;
                standard.isBusinessAccount = record.isBusinessAccount || record.is_business_account || record.data?.isBusinessAccount || record.data?.is_business_account || null;
                standard.isVerified = record.isVerified || record.is_verified || record.verified || record.data?.isVerified || record.data?.is_verified || record.data?.verified || null;

                // [NEW] Capture related profiles from raw record if present
                if (record.relatedProfiles && Array.isArray(record.relatedProfiles)) {
                    standard.relatedProfiles = record.relatedProfiles;
                }
            }
        } catch (e) {
            console.warn(`[ProfileNormalizationService] Normalization failed for record: ${e}`);
        }

        // [STRICT] Integrity Check
        // [FIX] Relax private profile skip: We still want metrics if they were scraped
        if (standard.isPrivate === true && !standard.followersCount) {
            console.warn(`[ProfileNormalizationService] Skipping private profile without data: ${standard.username}`);
            return null;
        }

        // [FIX] Fallback ID to username if missing
        if (!standard.id || standard.id === '') {
            standard.id = standard.username;
        }

        if (!standard.id || standard.id === '') {
            console.warn(`[ProfileNormalizationService] Skipping profile without ID or Username: ${JSON.stringify(record).substring(0, 100)}...`);
            return null;
        }

        return standard;
    }
}
