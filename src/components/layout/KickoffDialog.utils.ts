export function canApplyKickoffDialogOpenChange(args: {
  open: boolean;
  busy: boolean;
}) {
  return args.open || !args.busy;
}
