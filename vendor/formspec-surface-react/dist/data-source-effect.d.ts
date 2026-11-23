/** @filedesc Stops retired React data loads before they dispatch another host operation. */
import type { LoadWidgetDataInputsRequest } from '@formspec-org/surface';
export type EffectDataSourcePorts = Pick<LoadWidgetDataInputsRequest, 'authorize' | 'loader' | 'validatePayload'>;
/** Stop later owner phases when this effect retires; host authority stays in the ports. */
export declare function currentEffectDataSourcePorts(isCurrent: () => boolean, { loader, authorize, validatePayload }: EffectDataSourcePorts): EffectDataSourcePorts;
