import * as iam from '@aws-cdk/aws-iam';
import * as sfn from '@aws-cdk/aws-stepfunctions';
import { Token } from '@aws-cdk/core';
import { IntegrationConfig, IntegrationOptions, PassthroughBehavior } from '@aws-cdk/aws-apigateway';
import { Method } from '@aws-cdk/aws-apigateway';
import { AwsIntegration } from '@aws-cdk/aws-apigateway';

/**
 * StepFunctionsIntegrationOptions
 */
export interface StepFunctionsIntegrationOptions extends IntegrationOptions {
  /**
   * Use proxy integration or normal (request/response mapping) integration.
   *
   * @default false
   */
  readonly proxy?: boolean;

  /**
   * Check if cors is enabled
   * @default false
   */
  readonly corsEnabled?: boolean;

}
/**
 * Integrates a Synchronous Express State Machine from AWS Step Functions to an API Gateway method.
 *
 * @example
 *
 *    const handler = new sfn.StateMachine(this, 'MyStateMachine', ...);
 *    api.addMethod('GET', new StepFunctionsIntegration(handler));
 *
 */

export class StepFunctionsIntegration extends AwsIntegration {
  private readonly handler: sfn.IStateMachine;

  constructor(handler: sfn.IStateMachine, options: StepFunctionsIntegrationOptions = { }) {

    const integResponse = getIntegrationResponse();
    const requestTemplate = getRequestTemplates(handler);

    if (options.corsEnabled) {
      super({
        proxy: options.proxy,
        service: 'states',
        action: 'StartSyncExecution',
        options,
      });
    } else {
      super({
        proxy: options.proxy,
        service: 'states',
        action: 'StartSyncExecution',
        options: {
          credentialsRole: options.credentialsRole,
          integrationResponses: integResponse,
          passthroughBehavior: PassthroughBehavior.NEVER,
          requestTemplates: requestTemplate,
        },
      });
    }

    this.handler = handler;
  }

  public bind(method: Method): IntegrationConfig {
    const bindResult = super.bind(method);
    const principal = new iam.ServicePrincipal('apigateway.amazonaws.com');

    this.handler.grantExecution(principal, 'states:StartSyncExecution');

    let stateMachineName;

    if (this.handler instanceof sfn.StateMachine) {
      //if not imported, extract the name from the CFN layer to reach the
      //literal value if it is given (rather than a token)
      stateMachineName = (this.handler.node.defaultChild as sfn.CfnStateMachine).stateMachineName;
    } else {
      stateMachineName = 'StateMachine-' + (String(this.handler.stack.node.addr).substring(0, 8));
    }

    let deploymentToken;

    if (!Token.isUnresolved(stateMachineName)) {
      deploymentToken = JSON.stringify({ stateMachineName });
    }
    return {
      ...bindResult,
      deploymentToken,
    };

  }
}

function getIntegrationResponse() {
  const errorResponse = [
    {
      selectionPattern: '4\\d{2}',
      statusCode: '400',
      responseTemplates: {
        'application/json': `{
            "error": "Bad input!"
          }`,
      },
    },
    {
      selectionPattern: '5\\d{2}',
      statusCode: '500',
      responseTemplates: {
        'application/json': '"error": $input.path(\'$.error\')',
      },
    },
  ];

  const integResponse = [
    {
      statusCode: '200',
      responseTemplates: {
        'application/json': `#set($inputRoot = $input.path('$'))
                #if($input.path('$.status').toString().equals("FAILED"))
                    #set($context.responseOverride.status = 500)
                    { 
                      "error": "$input.path('$.error')",
                      "cause": "$input.path('$.cause')"
                    }
                #else
                    $input.path('$.output')
                #end`,
      },
    },
    ...errorResponse,
  ];

  return integResponse;
}

function getRequestTemplates(handler: sfn.IStateMachine) {
  const templateString = getTemplateString(handler);

  const requestTemplate: { [contenType:string] : string } =
    {
      'application/json': templateString,
    };

  return requestTemplate;
}

function getTemplateString(handler: sfn.IStateMachine): string {
  const templateString: string = `
      #set($inputRoot = $input.path('$')) {
          "input": "$util.escapeJavaScript($input.json(\'$\'))",
          "stateMachineArn": "${handler.stateMachineArn}"
        }`;

  return templateString;
}