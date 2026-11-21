import {NONROUTINE_NOTIFICATIONS_SCHEMA,createNonroutineNotifications} from './nonroutine-notifications.mjs';
export const STANDARD_NOTIFICATIONS_SCHEMA=NONROUTINE_NOTIFICATIONS_SCHEMA.replaceAll('maintenance_nonroutine_review_','maintenance_standard_review_').replaceAll('maintenance_nonroutine_notification_','maintenance_standard_notification_');
export function createStandardNotifications(options){return createNonroutineNotifications({...options,purpose:'STANDARD'});}
