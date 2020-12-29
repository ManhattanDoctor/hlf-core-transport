import { IFabricConnectionSettings } from '@hlf-core/api';
import { ITransportSettings } from '@ts-core/common/transport';

export interface ITransportFabricConnectionSettings extends IFabricConnectionSettings, ITransportSettings {
    reconnectDelay?: number;
    reconnectMaxAttempts?: number;
    isExitApplicationOnDisconnect?: boolean;
}
