// The real route marker, guards and RouterBroker instance parameter; unrelated routes omitted.
import {RouterBroker} from '@api/abstract/abstract.router';
import { chatController } from '@api/server.module';
import {HttpStatus} from './index.router';
export class ChatRouter extends RouterBroker {
 constructor(...guards){super();this.router
      .post(this.routerPath('sendPresence'), ...guards, async (req,res)=>res.status(201).json({legacy:true}));
 }
}
