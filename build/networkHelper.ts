import Ip from 'ip';
import os from 'os';

const UseLocalNetworkAddress = true;

export function getIpAddress(): string {
    const networkInterfaces = os.networkInterfaces();
    const nonLocalInterfaces: Record<string, os.NetworkInterfaceInfo[]> = {};
    let myNetworkAddress: string = Ip.address();

    for (const inet in networkInterfaces) {
        const addresses = networkInterfaces[inet]!;
        for (let i = 0; i < addresses.length; i++) {
            const address = addresses[i];
            if (!address.internal && !address.internal && address.family === 'IPv4') {
                if (!nonLocalInterfaces[inet]) {
                    nonLocalInterfaces[inet] = [];
                }
                nonLocalInterfaces[inet].push(address);
                if (
                    (UseLocalNetworkAddress && address.address.includes('192.168')) ||
                    (!UseLocalNetworkAddress && !address.address.includes('192.168'))
                ) {
                    myNetworkAddress = address.address;
                }
            }
        }
    }
    return myNetworkAddress;
}
