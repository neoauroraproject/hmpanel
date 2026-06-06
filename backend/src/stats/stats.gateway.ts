import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, Logger } from '@nestjs/common';
import { MonitoringService } from './monitoring.service';

@Injectable()
@WebSocketGateway({ cors: { origin: '*' } })
export class StatsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private logger = new Logger('StatsGateway');
  private interval: NodeJS.Timeout;

  constructor(private monitoringService: MonitoringService) {
    this.startLiveSpeedBroadcast();
  }

  handleConnection(client: Socket) {
    this.logger.log(`Dashboard WS connected: ${client.id}`);
    client.emit('live-online-clients', this.monitoringService.getLatestOnlineEmails());
    client.emit('live-speed', this.monitoringService.getLatestServerStatus());
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Dashboard WS disconnected: ${client.id}`);
  }

  private startLiveSpeedBroadcast() {
    this.interval = setInterval(() => {
      if (!this.server) return;
      
      const speedData = this.monitoringService.getLatestServerStatus();
      const onlineEmails = this.monitoringService.getLatestOnlineEmails();
      
      this.server.emit('live-speed', speedData);
      this.server.emit('live-online-clients', onlineEmails);
      
    }, 3000); // Poll cache every 3 seconds and broadcast
  }
}
