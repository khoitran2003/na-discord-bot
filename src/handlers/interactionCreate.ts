import { Interaction } from 'discord.js';
import { execute as executeSetup } from '../commands/setup';
import { execute as executeAdminPortal } from '../commands/adminPortal';
import { handleRegisterButton } from './buttons/register';
import { handleCancelButton, handleCancelSelect } from './buttons/cancel';
import { handleMyScheduleButton } from './buttons/mySchedule';
import { handleLanguageButton, handleSetLanguage } from './buttons/language';
import { handleRegDateSelect } from './selectMenus/regDateSelect';
import { handleRegRoomSelect } from './selectMenus/regRoomSelect';
import { handleTimeSelect } from './selectMenus/timeSelect';
import { handleBookingModal } from './modals/bookingModal';
import {
  handleManageRoomsButton,
  handleRoomSelectAdmin,
  handleRoomAddButton,
  handleRoomEditButton,
  handleRoomDeleteButton,
  handleRoomDeleteConfirm,
  handleRoomDeleteCancel,
  handleRoomAddModal,
  handleRoomEditModal,
} from './admin/roomsAdmin';
import {
  handleManageTimeslotsButton,
  handleTimeslotsEditButton,
  handleTimeslotsModal,
} from './admin/timeslotsAdmin';
import {
  handleManageRulesButton,
  handleRulesEditNumbersButton,
  handleRulesNumbersModal,
  handleRulesEditScheduleButton,
  handleRulesScheduleModal,
  handleRulesEditLiveValidityButton,
  handleRulesLiveValidityModal,
  handleRulesEditAntiFraudButton,
  handleRulesAntiFraudModal,
} from './admin/rulesAdmin';
import {
  handleViewBookingsButton,
  handleViewBookingsFilterSelect,
  handleExportBookingsButton,
  handleCancelBookingSelect,
} from './admin/bookingsAdmin';
import { handleBroadcastButton, handleBroadcastModal } from './admin/broadcastAdmin';
import { getUserLanguage } from '../services/userPreferenceService';
import { t } from '../i18n';

export async function handleInteraction(interaction: Interaction) {
  try {
    if (interaction.isChatInputCommand()) {
      switch (interaction.commandName) {
        case 'setup':
          return void (await executeSetup(interaction));
        case 'admin-portal':
          return void (await executeAdminPortal(interaction));
      }
      return;
    }

    if (interaction.isButton()) {
      const [action] = interaction.customId.split(':');
      switch (action) {
        case 'btn_register':
          return void (await handleRegisterButton(interaction));
        case 'btn_register_dates':
          return void (await handleRegisterButton(interaction));
        case 'btn_cancel':
          return void (await handleCancelButton(interaction));
        case 'btn_my_schedule':
          return void (await handleMyScheduleButton(interaction));
        case 'btn_language':
          return void (await handleLanguageButton(interaction));
        case 'set_lang':
          return void (await handleSetLanguage(interaction));
        case 'admin_manage_rooms':
          return void (await handleManageRoomsButton(interaction));
        case 'admin_room_add':
          return void (await handleRoomAddButton(interaction));
        case 'admin_room_edit':
          return void (await handleRoomEditButton(interaction));
        case 'admin_room_delete':
          return void (await handleRoomDeleteButton(interaction));
        case 'admin_room_delete_confirm':
          return void (await handleRoomDeleteConfirm(interaction));
        case 'admin_room_delete_cancel':
          return void (await handleRoomDeleteCancel(interaction));
        case 'admin_manage_timeslots':
          return void (await handleManageTimeslotsButton(interaction));
        case 'admin_timeslots_edit':
          return void (await handleTimeslotsEditButton(interaction));
        case 'admin_manage_rules':
          return void (await handleManageRulesButton(interaction));
        case 'admin_rules_edit_numbers':
          return void (await handleRulesEditNumbersButton(interaction));
        case 'admin_rules_edit_schedule':
          return void (await handleRulesEditScheduleButton(interaction));
        case 'admin_rules_edit_live_validity':
          return void (await handleRulesEditLiveValidityButton(interaction));
        case 'admin_rules_edit_antifraud':
          return void (await handleRulesEditAntiFraudButton(interaction));
        case 'admin_view_bookings':
          return void (await handleViewBookingsButton(interaction));
        case 'admin_export_bookings':
          return void (await handleExportBookingsButton(interaction));
        case 'admin_broadcast':
          return void (await handleBroadcastButton(interaction));
      }
      return;
    }

    if (interaction.isStringSelectMenu()) {
      const [action] = interaction.customId.split(':');
      switch (action) {
        case 'reg_select_date':
          return void (await handleRegDateSelect(interaction));
        case 'reg_select_room':
          return void (await handleRegRoomSelect(interaction));
        case 'reg_select_time':
          return void (await handleTimeSelect(interaction));
        case 'select_cancel':
          return void (await handleCancelSelect(interaction));
        case 'admin_room_select':
          return void (await handleRoomSelectAdmin(interaction));
        case 'admin_view_bookings_filter':
          return void (await handleViewBookingsFilterSelect(interaction));
        case 'admin_cancel_booking':
          return void (await handleCancelBookingSelect(interaction));
      }
      return;
    }

    if (interaction.isModalSubmit()) {
      const [action] = interaction.customId.split(':');
      switch (action) {
        case 'modal_booking':
          return void (await handleBookingModal(interaction));
        case 'admin_modal_room_add':
          return void (await handleRoomAddModal(interaction));
        case 'admin_modal_room_edit':
          return void (await handleRoomEditModal(interaction));
        case 'admin_modal_timeslots':
          return void (await handleTimeslotsModal(interaction));
        case 'admin_modal_rules_numbers':
          return void (await handleRulesNumbersModal(interaction));
        case 'admin_modal_rules_schedule':
          return void (await handleRulesScheduleModal(interaction));
        case 'admin_modal_rules_live_validity':
          return void (await handleRulesLiveValidityModal(interaction));
        case 'admin_modal_rules_antifraud':
          return void (await handleRulesAntiFraudModal(interaction));
        case 'admin_broadcast_modal':
          return void (await handleBroadcastModal(interaction));
      }
      return;
    }
  } catch (err) {
    console.error('Lỗi xử lý interaction:', err);
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      const lang = await getUserLanguage(interaction.user.id).catch(() => 'vi' as const);
      await interaction.reply({ content: t('errors.generic', lang), ephemeral: true }).catch(() => {});
    }
  }
}
